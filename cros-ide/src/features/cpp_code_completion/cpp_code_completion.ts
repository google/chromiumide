// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as commonUtil from '../../common/common_util';
import * as ideUtil from '../../ide_util';
import {ChrootService} from '../../services/chroot';
import * as bgTaskStatus from '../../ui/bg_task_status';
import {
  CompdbError,
  CompdbErrorKind,
  CompdbService,
  CompdbServiceImpl,
} from './compdb_service';
import {CLANGD_EXTENSION, SHOW_LOG_COMMAND} from './constants';
import {Atom, Packages} from './packages';

export function activate(
  context: vscode.ExtensionContext,
  statusManager: bgTaskStatus.StatusManager,
  chrootService: ChrootService
) {
  const log = vscode.window.createOutputChannel('CrOS IDE: C++ Support');
  vscode.commands.registerCommand(SHOW_LOG_COMMAND.command, () => log.show());

  const compdbService = new CompdbServiceImpl(
    log.append.bind(log),
    chrootService
  );
  context.subscriptions.push(
    new CompilationDatabase(
      statusManager,
      new Packages(),
      log,
      compdbService,
      chrootService
    )
  );
}

const STATUS_BAR_TASK_ID = 'C++ Support';

export class CompilationDatabase implements vscode.Disposable {
  private readonly jobManager = new commonUtil.JobManager<void>();
  private readonly disposables: vscode.Disposable[] = [];
  // Packages for which compdb has been generated in this session.
  private readonly generated = new Set<Atom>();
  // Store errors to avoid showing the same error many times.
  private readonly ignoredError: Set<CompdbErrorKind> = new Set();

  // Indicates CompilationDatabase activated clangd
  // (it might have been already activated independently, in which case we will
  // activate it again - not ideal, but not a problem either).
  private clangdActivated = false;

  // Callbacks called after an event has been handled.
  readonly onEventHandledForTesting = new Array<() => void>();

  constructor(
    private readonly statusManager: bgTaskStatus.StatusManager,
    private readonly packages: Packages,
    private readonly log: vscode.OutputChannel,
    private readonly compdbService: CompdbService,
    private readonly chrootService: ChrootService
  ) {
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(async editor => {
        if (editor?.document.languageId === 'cpp') {
          await this.generate(
            editor.document,
            /* skipIfAlreadyGenerated = */ true
          );
        }
        this.onEventHandledForTesting.forEach(f => f());
      })
    );

    // Update compilation database when a GN file is updated.
    this.disposables.push(
      vscode.workspace.onDidSaveTextDocument(async document => {
        if (document.fileName.match(/\.gni?$/)) {
          await this.generate(document);
        }
        this.onEventHandledForTesting.forEach(f => f());
      })
    );

    const document = vscode.window.activeTextEditor?.document;
    if (document) {
      this.generate(document);
    }
  }

  dispose() {
    for (const d of this.disposables) {
      d.dispose();
    }
  }

  private async ensureClangdIsActivated() {
    if (this.clangdActivated) {
      return true;
    }

    const clangd = vscode.extensions.getExtension(CLANGD_EXTENSION);
    if (!clangd) {
      return false;
    }

    // Make sure the extension is activated, because we want to call 'clangd.restart'.
    await clangd.activate();
    this.clangdActivated = true;
    return true;
  }

  // Generate compilation database for clangd.
  private async generate(
    document: vscode.TextDocument,
    skipIfAlreadyGenerated?: boolean
  ) {
    if (!(await this.ensureClangdIsActivated())) {
      return;
    }
    const packageInfo = await this.packages.fromFilepath(document.fileName);
    if (!packageInfo) {
      return;
    }
    if (skipIfAlreadyGenerated && this.generated.has(packageInfo.atom)) {
      return;
    }
    const chroot = this.chrootService.chroot();
    if (chroot === undefined) {
      return;
    }

    const board = await ideUtil.getOrSelectTargetBoard(chroot);
    if (board instanceof ideUtil.NoBoardError) {
      await vscode.window.showErrorMessage(
        `Generate compilation database: ${board.message}`
      );
      return;
    } else if (board === null) {
      return;
    }

    // Below, we create compilation database based on the project and the board.
    // Generating the database is time consuming involving execution of external
    // processes, so we ensure it to run only one at a time using the manager.
    await this.jobManager.offer(async () => {
      try {
        await this.compdbService.generate(board, packageInfo);
        await vscode.commands.executeCommand('clangd.restart');
      } catch (e) {
        if (e instanceof CompdbError) {
          if (!this.ignoredError.has(e.details.kind)) {
            this.showErrorMessageWithShowLogOption(board, e);
          }
        }

        this.log.appendLine((e as Error).message);
        console.error(e);
        this.statusManager.setTask(STATUS_BAR_TASK_ID, {
          status: bgTaskStatus.TaskStatus.ERROR,
          command: SHOW_LOG_COMMAND,
        });
        return;
      }
      this.generated.add(packageInfo.atom);
      this.statusManager.setTask(STATUS_BAR_TASK_ID, {
        status: bgTaskStatus.TaskStatus.OK,
        command: SHOW_LOG_COMMAND,
      });
    });
  }

  showErrorMessageWithShowLogOption(board: string, e: CompdbError) {
    const SHOW_LOG = 'Show Log';
    const IGNORE = 'Ignore';

    const {message, button} = uiItemsForError(board, e);
    const buttons: string[] = (button ? [button.name] : []).concat(
      SHOW_LOG,
      IGNORE
    );

    // `await` cannot be used, because it blocks forever if the
    // message is dismissed by timeout.
    vscode.window.showErrorMessage(message, ...buttons).then(value => {
      if (button && value === button.name) {
        button.action();
      } else if (value === SHOW_LOG) {
        this.log.show();
      } else if (value === IGNORE) {
        this.ignoredError.add(e.details.kind);
      }
    });
  }
}

type Button = {
  name: string;
  action: () => void;
};

function uiItemsForError(
  board: string,
  e: CompdbError
): {message: string; button?: Button} {
  switch (e.details.kind) {
    case CompdbErrorKind.RemoveCache:
      return {
        message: `Faild to generate cross reference; try removing the file ${e.details.cache} and reload the IDE`,
      };
      // TODO(oka): Add a button to open the terminal with the command to run.
      break;
    case CompdbErrorKind.InvalidPassword:
      return {
        message: e.message,
      };
    case CompdbErrorKind.RunEbuild: {
      const buildPackages = `build_packages --board=${board}`;
      return {
        message: `Failed to generate cross reference; try running "${buildPackages}" in chroot and reload the IDE`,
        button: {
          name: 'Open document',
          action: () => {
            vscode.env.openExternal(
              vscode.Uri.parse(
                'https://chromium.googlesource.com/chromiumos/docs/+/HEAD/developer_guide.md#build-the-packages-for-your-board'
              )
            );
          },
        },
      };
    }
    case CompdbErrorKind.NotGenerated:
      return {
        message:
          'Faild to generate cross reference: compile_commands_chroot.json was not created; file a bug on go/cros-ide-new-bug',
        button: {
          name: 'File a bug',
          action: () => {
            vscode.env.openExternal(
              vscode.Uri.parse('http://go/cros-ide-new-bug')
            );
          },
        },
      };
    case CompdbErrorKind.CopyFailed:
      return {
        message: `Faild to generate cross reference; try removing ${e.details.destination} and reload the IDE`,
        // TODO(oka): Add a button to open the terminal with the command to run.
      };
  }
}
