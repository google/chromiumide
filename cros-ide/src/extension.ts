// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * This is the main entry point for the vsCode plugin.
 *
 * Keep this minimal - breakout GUI and App-Behavior to separate files.
 */
import * as vscode from 'vscode';
import * as sourceMapSupport from 'source-map-support';
import * as cipd from './common/cipd';
import * as commonUtil from './common/common_util';
import * as features from './features';
import * as codesearch from './features/codesearch';
import * as crosLint from './features/cros_lint';
import * as gerrit from './features/gerrit';
import * as gn from './features/gn';
import * as hints from './features/hints';
import * as feedback from './features/metrics/feedback';
import * as metrics from './features/metrics/metrics';
import * as metricsConfig from './features/metrics/metrics_config';
import * as shortLinkProvider from './features/short_link_provider';
import * as showHelp from './features/show_help';
import * as suggestExtension from './features/suggest_extension';
import * as upstart from './features/upstart';
import * as ideUtil from './ide_util';
import * as logs from './logs';
import * as services from './services';
import * as config from './services/config';
import * as gitDocument from './services/git_document';
import * as bgTaskStatus from './ui/bg_task_status';

// Install source map if it's available so that error stacktraces show TS
// filepaths during our development.
sourceMapSupport.install({});

export interface ExtensionApi {
  // ExtensionContext passed to the activation function.
  // Available only when the extension is activated for testing.
  context?: vscode.ExtensionContext;
}

export async function activate(
  context: vscode.ExtensionContext
): Promise<ExtensionApi> {
  // Activate metrics first so that other components can emit metrics on activation.
  await metrics.activate(context);

  try {
    return await postMetricsActivate(context);
  } catch (err) {
    metrics.send({
      category: 'error',
      group: 'misc',
      description: `activate failed: ${err}`,
    });
    throw err;
  }
}

async function postMetricsActivate(
  context: vscode.ExtensionContext
): Promise<ExtensionApi> {
  assertOutsideChroot();

  const statusManager = bgTaskStatus.activate(context);
  const cipdRepository = new cipd.CipdRepository();

  const chromiumosServices = new services.chromiumos.ChromiumosServiceModule();

  context.subscriptions.push(
    new ChromiumActivation(context, statusManager),
    new ChromiumosActivation(
      context,
      statusManager,
      cipdRepository,
      chromiumosServices
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(ideUtil.SHOW_UI_LOG.command, () => {
      ideUtil.getUiLogger().show();
      metrics.send({
        category: 'interactive',
        group: 'idestatus',
        action: 'show ui actions log',
      });
    })
  );

  // The logger that should be used by linters/code-formatters.
  const linterLogger = logs.createLinterLoggingBundle(context);

  // We need an item in the IDE status, which lets users discover the UI log. Since UI actions
  // which result in an error should show a popup, we will not be changing the status
  statusManager.setTask('UI Actions', {
    status: bgTaskStatus.TaskStatus.OK,
    command: ideUtil.SHOW_UI_LOG,
  });

  crosLint.activate(context, statusManager, linterLogger);
  gn.activate(context, statusManager, linterLogger);
  shortLinkProvider.activate(context);
  codesearch.activate(context);
  suggestExtension.activate(context);
  feedback.activate(context);
  upstart.activate(context);
  hints.activate(context);
  showHelp.activate(context);

  const gitDocumentProvider = new gitDocument.GitDocumentProvider();
  gitDocumentProvider.activate();

  if (config.gerrit.enabled.get()) {
    const gitDirsWatcher = new services.GitDirsWatcher('/');
    gerrit.activate(
      context,
      statusManager,
      gitDocumentProvider,
      gitDirsWatcher
    );
  }

  // We want to know if some users flip enablement bit.
  // If the feature is disabled it could mean that it's annoying.
  if (!config.gerrit.enabled.hasDefaultValue()) {
    metrics.send({
      category: 'background',
      group: 'misc',
      action: 'gerrit enablement',
      label: String(config.gerrit.enabled.get()),
    });
  }

  metrics.send({
    category: 'background',
    group: 'misc',
    action: 'activate',
  });

  const age = await metricsConfig.getUserIdAgeInDays();
  metrics.send({
    category: 'background',
    group: 'misc',
    action: 'user ID age',
    label: age.toString(),
  });

  return {
    context:
      context.extensionMode === vscode.ExtensionMode.Test ? context : undefined,
  };
}

/**
 * Registers a handler to activate chromiumos features when the workspace
 * contains chromiumos source code.
 *
 * TODO(oka): Remove this class, using ChromiumosServiceModule instead.
 */
class ChromiumosActivation implements vscode.Disposable {
  private readonly watcher = new services.ProductWatcher('chromiumos');
  private chromiumosFeatures?: features.Chromiumos;

  private readonly subscriptions: vscode.Disposable[] = [this.watcher];

  dispose() {
    this.chromiumosFeatures?.dispose();
    vscode.Disposable.from(...this.subscriptions.reverse()).dispose();
  }

  constructor(
    context: vscode.ExtensionContext,
    statusManager: bgTaskStatus.StatusManager,
    cipdRepository: cipd.CipdRepository,
    chromiumosServices: services.chromiumos.ChromiumosServiceModule
  ) {
    this.subscriptions.push(
      this.watcher.onDidChangeRoot(root => {
        this.chromiumosFeatures?.dispose();
        this.chromiumosFeatures = root
          ? new features.Chromiumos(
              context,
              root,
              statusManager,
              cipdRepository,
              chromiumosServices
            )
          : undefined;
      })
    );
  }
}

/**
 * Registers a handler to activate chromium features when the workspace
 * contains chromium source code.
 */
class ChromiumActivation implements vscode.Disposable {
  private readonly watcher = new services.ProductWatcher('chromium');
  private chromiumFeatures?: features.Chromium;

  private readonly subscriptions: vscode.Disposable[] = [this.watcher];

  dispose() {
    this.chromiumFeatures?.dispose();
    vscode.Disposable.from(...this.subscriptions.reverse()).dispose();
  }

  constructor(
    context: vscode.ExtensionContext,
    statusManager: bgTaskStatus.StatusManager
  ) {
    this.subscriptions.push(
      this.watcher.onDidChangeRoot(root => {
        this.chromiumFeatures?.dispose();
        this.chromiumFeatures = root
          ? new features.Chromium(context, root, statusManager)
          : undefined;
      })
    );
  }
}

function assertOutsideChroot() {
  if (!commonUtil.isInsideChroot()) {
    return;
  }
  void (async () => {
    const openDocument = 'Open document';
    const choice = await vscode.window.showWarningMessage(
      'Support for running VSCode inside chroot is dropped in the next release that comes soon; please read go/cros-ide-quickstart and update your setup.',
      {modal: true},
      openDocument
    );
    if (choice === openDocument) {
      void vscode.env.openExternal(
        vscode.Uri.parse('http://go/cros-ide-quickstart')
      );
    }
  })();
}
