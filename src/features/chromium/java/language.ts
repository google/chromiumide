// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as path from 'path';
import * as vscode from 'vscode';
import {
  DidChangeConfigurationNotification,
  DocumentSelector,
  HandleDiagnosticsSignature,
  LanguageClient,
  LanguageClientOptions,
  NotificationType,
  RevealOutputChannelOn,
  ServerOptions,
  TransportKind,
} from 'vscode-languageclient/node';
import {getDriver} from '../../../../shared/app/common/driver_repository';
import {statNoThrow} from '../../../common/fs_util';
import {ensureOrRunGcert} from '../../../common/gcert';
import {computeCompilerConfig} from './chromium';
import {CompilerConfig} from './chromium/config';
import {StatusBar} from './ui';
import {FilePathWatcher, withPseudoCancel} from './utils';

const driver = getDriver();

// A selector expression that matches local Java source files that are
// supported by the language server.
const JAVA_DOCUMENT_SELECTOR: DocumentSelector = [
  {
    scheme: 'file',
    language: 'java',
  },
];

async function ensureCert(): Promise<void> {
  await ensureOrRunGcert({
    noCheckSsh: true,
    gcertReason: 'to start Chromium Java language server',
  });
}

interface ChromiumIdeStartProgressParams {
  id: string;
  message: string;
}

interface ChromiumIdeEndProgressParams {
  id: string;
}

class LanguageServerConnection implements vscode.Disposable {
  private readonly client: LanguageClient;
  private readonly subscriptions: vscode.Disposable[] = [];

  /**
   * Creates a new connection.
   *
   * It just creates an uninitialized connection, and does not start a language
   * server. Call start() to start it.
   */
  constructor(
    extensionPath: string,
    srcDir: string,
    readonly config: CompilerConfig,
    output: vscode.OutputChannel,
    statusBar: StatusBar
  ) {
    const clientOptions: LanguageClientOptions = {
      documentSelector: JAVA_DOCUMENT_SELECTOR,
      synchronize: {
        // In the upstream extension, 'java' is specified here to send all VSCode
        // configs prefixed by 'java.' to the language server. However we want to
        // set them dynamically by inspecting Chromium Java build rules in GN.
        // Therefore we install a middleware for didChangeConfiguration below to
        // inject computed configs. We still need to specify a fake section name
        // here to let the language client send an initial
        // workspace/didChangeConfiguration notification.
        configurationSection: 'fake_configuration_section',
        fileEvents: [vscode.workspace.createFileSystemWatcher('**/*.java')],
      },
      outputChannel: output,
      revealOutputChannelOn: RevealOutputChannelOn.Info,
      traceOutputChannel: output,
      middleware: {
        workspace: {
          // Intercept didChangeConfiguration to inject computed configs. See the
          // comments for "synchronize" above for details.
          didChangeConfiguration: () => {
            const settings = {
              java: {
                classPath: config.classPaths,
                docPath: config.sourcePaths,
                importOrder: 'chromium',
              },
            };
            return this.client.sendNotification(
              DidChangeConfigurationNotification.type,
              {settings}
            );
          },
        },
        handleDiagnostics: (
          uri: vscode.Uri,
          diagnostics: vscode.Diagnostic[],
          next: HandleDiagnosticsSignature
        ): void => {
          driver.metrics.send({
            category: 'background',
            group: 'chromium.java',
            name: 'chromium_java_lint',
            description: 'chromium java: lint',
            length: diagnostics.length,
          });
          next(uri, diagnostics);
        },
      },
      initializationOptions: {
        sourcePaths: config.sourcePaths,
      },
    };

    const serverOptions: ServerOptions = {
      transport: TransportKind.stdio,
      command: path.join(
        extensionPath,
        'helpers',
        'start-java-language-server.sh'
      ),
      options: {
        cwd: extensionPath,
        env: {
          ...process.env,
          JAVA_HOME: path.join(srcDir, 'third_party/jdk/current'),
        },
      },
    };

    this.client = new LanguageClient(
      // This ID is internally used to locate the VSCode settings about debugging
      // the protocol: "chromiumide.chromium.java.trace.server" will be checked
      // to set the verbosity.
      // https://code.visualstudio.com/api/language-extensions/language-server-extension-guide#logging-support-for-language-server
      'chromiumide.chromium.java',
      // This name is used primarily in error messages.
      'Chromium Java',
      serverOptions,
      clientOptions
    );

    this.subscriptions.push(
      this.client.onNotification(
        new NotificationType<ChromiumIdeStartProgressParams>(
          'chromiumide/startProgress'
        ),
        params => {
          statusBar.startProgress(params.id, params.message);
        }
      ),
      this.client.onNotification(
        new NotificationType<ChromiumIdeEndProgressParams>(
          'chromiumide/endProgress'
        ),
        params => {
          statusBar.endProgress(params.id);
        }
      )
    );
  }

  dispose(): void {
    void this.client.dispose();
    for (const subscription of this.subscriptions) {
      subscription.dispose();
    }
  }

  start(): Promise<void> {
    return this.client.start();
  }
}

/**
 * Represents a session of a Java language server.
 *
 * A session is associated with an output directory. It must be restarted when
 * the user changed the output directory.
 */
export class LanguageServerSession implements vscode.Disposable {
  readonly connection: Promise<LanguageServerConnection>;
  private readonly tokenSource = new vscode.CancellationTokenSource();

  /**
   * Creates a session, and starts it asynchronously.
   */
  constructor(
    extensionPath: string,
    srcDir: string,
    outDir: string,
    readonly outDirInode: number,
    output: vscode.OutputChannel,
    statusBar: StatusBar,
    skipCertCheck: boolean,
    apiVersion?: number
  ) {
    output.appendLine(
      `Starting a new session for output directory (ino=${this.outDirInode})`
    );
    this.connection = LanguageServerSession.startLanguageServer(
      extensionPath,
      srcDir,
      outDir,
      output,
      statusBar,
      this.tokenSource.token,
      skipCertCheck,
      apiVersion
    );
    this.connection.catch(e => {
      if (e instanceof vscode.CancellationError) {
        // No popup is needed for cancellation.
      } else {
        void (async () => {
          // Log a detailed stack trace.
          output.appendLine(
            e instanceof Error ? e.stack ?? e.message : String(e)
          );

          // Show an error popup.
          const OPEN_LOGS = 'Open logs';
          const choice = await vscode.window.showErrorMessage(
            String(e),
            OPEN_LOGS
          );
          if (choice === OPEN_LOGS) {
            output.show();
          }
        })();
      }
    });
  }

  dispose(): void {
    this.tokenSource.cancel();
    this.tokenSource.dispose();
    void this.connection.then(c => c.dispose());
  }

  /**
   * Creates and starts a language server.
   *
   * @returns A promise that will be resolved once the server successfully
   *    starts. It will be rejected if the server fails to start.
   */
  private static async startLanguageServer(
    extensionPath: string,
    srcDir: string,
    outDir: string,
    output: vscode.OutputChannel,
    statusBar: StatusBar,
    token: vscode.CancellationToken,
    skipCertCheck: boolean,
    apiVersion?: number
  ): Promise<LanguageServerConnection> {
    if (!skipCertCheck) {
      await ensureCert();
    }

    const config = await computeCompilerConfig(
      srcDir,
      outDir,
      output,
      statusBar,
      token,
      apiVersion
    );

    const connection = new LanguageServerConnection(
      extensionPath,
      srcDir,
      config,
      output,
      statusBar
    );

    try {
      await statusBar.withProgress('Starting language server...', async () => {
        await withPseudoCancel(connection.start(), token);
      });
    } catch (e) {
      void connection.dispose();
      throw e;
    }
    return connection;
  }
}

/**
 * Manages LanguageServerSession.
 *
 * It monitors the filesystem and events to start/stop LanguageServerSession
 * and update the status bar appropriately.
 */
export class LanguageServerManager implements vscode.Disposable {
  private readonly subscriptions: vscode.Disposable[] = [];
  private readonly outDir: string;
  private readonly outDirWatcher: FilePathWatcher;
  private session: LanguageServerSession | undefined;
  private didOpenJavaSource = false;
  private didWarnOutDir = false;
  private disposed = false;

  constructor(
    private readonly extensionPath: string,
    private readonly srcDir: string,
    private readonly output: vscode.OutputChannel,
    private readonly statusBar: StatusBar,
    private readonly skipCertCheck = false,
    private readonly apiVersion?: number
  ) {
    this.outDir = path.join(srcDir, 'out', 'current_link');

    // Watch for output directory changes.
    this.outDirWatcher = new FilePathWatcher(this.outDir);
    this.subscriptions.push(
      this.outDirWatcher.onDidChangeInode(() => this.onDidOutDirChange())
    );

    // Watch for Java source opens.
    this.subscriptions.push(
      vscode.workspace.onDidOpenTextDocument(textDocument => {
        if (vscode.languages.match(JAVA_DOCUMENT_SELECTOR, textDocument) > 0) {
          this.onDidOpenJavaSource();
        }
      })
    );
    if (
      vscode.workspace.textDocuments.some(
        textDocument =>
          vscode.languages.match(JAVA_DOCUMENT_SELECTOR, textDocument) > 0
      )
    ) {
      this.onDidOpenJavaSource();
    }
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;

    if (this.session) {
      this.session.dispose();
    }
    this.outDirWatcher.dispose();
    for (const subscription of this.subscriptions) {
      subscription.dispose();
    }
  }

  async getCompilerConfig(): Promise<CompilerConfig | undefined> {
    if (!this.session) {
      return undefined;
    }
    try {
      const connection = await this.session.connection;
      return connection.config;
    } catch {
      return undefined;
    }
  }

  private onDidOutDirChange(): void {
    if (this.didOpenJavaSource) {
      void this.maybeUpdateSession();
    }
  }

  private onDidOpenJavaSource(): void {
    this.didOpenJavaSource = true;
    void this.maybeUpdateSession();
  }

  private async maybeUpdateSession(): Promise<void> {
    const newOutDirInode = await this.getOutDirInode();
    if (newOutDirInode === undefined) {
      if (this.session !== undefined) {
        // The output directory was removed.
        this.updateSession(undefined);
        void vscode.window.showWarningMessage(
          'Stopping Java language server since the output directory was removed. Some other errors may be shown from the language server instance.'
        );
      } else if (this.didOpenJavaSource && !this.didWarnOutDir) {
        // The user opened a Java source file, but we cannot start a language
        // server because the output directory is not selected yet. Ask the
        // user to select one by showing a popup.
        this.didWarnOutDir = true;
        void (async () => {
          const SHOW_OUTPUT_DIRS = 'Show output directories';
          const choice = await vscode.window.showInformationMessage(
            'Select an output directory to enable Chromium Java support.',
            SHOW_OUTPUT_DIRS
          );
          if (choice === SHOW_OUTPUT_DIRS) {
            void vscode.commands.executeCommand(
              'chromiumide.chromium.outputDirectories.focus'
            );
          }
        })();
      }
      return;
    }

    if (this.session !== undefined) {
      // If the output directory inode didn't change, do nothing.
      if (this.session.outDirInode === newOutDirInode) {
        return;
      }

      // Need to restart a session because the output directory changed.
      this.updateSession(undefined);
      void vscode.window.showInformationMessage(
        'Restarting Java language server since the output directory was changed. Some other errors may be shown from the old language server instance.'
      );
    }

    const session = new LanguageServerSession(
      this.extensionPath,
      this.srcDir,
      this.outDir,
      newOutDirInode,
      this.output,
      this.statusBar,
      this.skipCertCheck,
      this.apiVersion
    );
    session.connection.catch(() => {
      // If the language client fails to start, deactivate the session.
      if (this.session === session) {
        this.updateSession(undefined);
      }
    });
    this.updateSession(session);
  }

  private updateSession(session: LanguageServerSession | undefined): void {
    if (this.session !== undefined) {
      this.session.dispose();
      this.session = undefined;
    }
    this.session = session;
    if (session) {
      this.statusBar.show();
      driver.metrics.send({
        category: 'background',
        group: 'chromium.java',
        name: 'chromium_java_server_start',
        description: 'chromium java: start',
      });
    } else {
      this.statusBar.hide();
    }
  }

  private async getOutDirInode(): Promise<number | undefined> {
    const stat = await statNoThrow(this.outDir);
    return stat?.ino;
  }
}
