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
import * as commonUtil from '../shared/app/common/common_util';
import {
  getDriver,
  registerDriver,
} from '../shared/app/common/driver_repository';
import {vscodeRegisterCommand} from '../shared/app/common/vscode/commands';
import {activate as activateSharedFeatures} from '../shared/app/extension';
import * as config from '../shared/app/services/config';
import * as bgTaskStatus from '../shared/app/ui/bg_task_status';
import {TaskStatus} from '../shared/app/ui/bg_task_status';
import {SHOW_UI_LOG, getUiLogger} from '../shared/app/ui/log';
import {Driver} from '../shared/driver';
import * as cipd from './common/cipd';
import {CppXrefs} from './common/cpp_xrefs/cpp_xrefs';
import {DriverImpl} from './driver';
import * as metricsConfig from './driver/metrics/metrics_config';
import * as features from './features';
import * as boilerplate from './features/boilerplate';
import {CodeServer} from './features/code_server';
import * as codesearch from './features/codesearch';
import * as deviceManagement from './features/device_management';
import * as dirMetadata from './features/dir_metadata';
import {DisclaimerOnMac} from './features/disclaimer_on_mac';
import {Gcert} from './features/gcert';
import * as gerrit from './features/gerrit';
import * as hints from './features/hints';
import * as ownersLinks from './features/owners_links';
import * as shortLinkProvider from './features/short_link_provider';
import * as showHelp from './features/show_help';
import * as suggestExtension from './features/suggest_extension';
import * as upstart from './features/upstart';
import * as migrate from './migrate';
import * as services from './services';
import * as gitDocument from './services/git_document';

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
  // Migrate user configs if needed before anything else.
  await migrate.migrate();

  registerDriver(new DriverImpl());
  // Activate metrics (a shared feature) so that other components can emit metrics on activation.
  const {statusManager} = await activateSharedFeatures(
    context,
    new DriverImpl()
  );
  const driver = getDriver();

  try {
    return await postMetricsActivate(context, driver, statusManager);
  } catch (err) {
    driver.metrics.send({
      category: 'error',
      group: 'misc',
      description: `activate failed: ${err}`,
      name: 'extension_activation_failed',
    });
    throw err;
  }
}

async function postMetricsActivate(
  context: vscode.ExtensionContext,
  driver: Driver,
  statusManager: bgTaskStatus.StatusManager
): Promise<ExtensionApi> {
  // Put it on top to ensure the disclaimer is shown even if the following code malfunctions.
  context.subscriptions.push(new DisclaimerOnMac());

  await assertOutsideChroot();

  const cipdRepository = new cipd.CipdRepository();

  const chromiumosServices = new services.chromiumos.ChromiumosServiceModule();

  deviceManagement.activate(
    context,
    statusManager,
    chromiumosServices,
    cipdRepository
  );

  const boilerplateInserter = new boilerplate.BoilerplateInserter();
  context.subscriptions.push(boilerplateInserter);

  const cppXrefs = new CppXrefs(statusManager);

  context.subscriptions.push(
    cppXrefs,
    new ChromiumActivation(
      context,
      statusManager,
      boilerplateInserter,
      cppXrefs
    ),
    new ChromiumosActivation(
      context,
      statusManager,
      boilerplateInserter,
      cipdRepository,
      chromiumosServices,
      cppXrefs
    ),
    new CodeServer()
  );

  context.subscriptions.push(
    vscodeRegisterCommand(SHOW_UI_LOG.command, () => {
      getUiLogger().show();
      driver.metrics.send({
        category: 'interactive',
        group: 'idestatus',
        description: 'show ui actions log',
        name: 'show_ui_actions_log',
      });
    })
  );

  // We need an item in the IDE status, which lets users discover the UI log. Since UI actions
  // which result in an error should show a popup, we will not be changing the status
  statusManager.setTask('UI Actions', {
    status: TaskStatus.OK,
    command: SHOW_UI_LOG,
  });

  shortLinkProvider.activate(context);
  if (config.ownersFiles.links.get()) {
    ownersLinks.activate(context);
  }
  if (config.dirMetadata.links.get()) {
    dirMetadata.activate(context, statusManager, cipdRepository);
  }
  codesearch.activate(context);
  suggestExtension.activate(context);
  upstart.activate(context);
  hints.activate(context);
  showHelp.activate(context);

  const gitDocumentProvider = new gitDocument.GitDocumentProvider();
  gitDocumentProvider.activate();

  if (config.gerrit.enabled.get()) {
    const gitDirsWatcher = new services.GitDirsWatcher('/');
    context.subscriptions.push(
      gerrit.activate(statusManager, gitDirsWatcher),
      gitDirsWatcher
    );
  }
  context.subscriptions.push(new Gcert(getUiLogger()));

  // We want to know if some users flip enablement bit.
  // If the feature is disabled it could mean that it's annoying.
  if (!config.gerrit.enabled.hasDefaultValue()) {
    driver.metrics.send({
      category: 'background',
      group: 'gerrit',
      description: 'gerrit enablement',
      name: 'gerrit_setting_toggled',
      flag: String(config.gerrit.enabled.get()),
    });
  }

  driver.metrics.send({
    category: 'background',
    group: 'misc',
    description: 'activate',
    name: 'extension_activated',
  });

  const age = await metricsConfig.getUserIdAgeInDays();
  driver.metrics.send({
    category: 'background',
    group: 'misc',
    description: 'user ID age',
    name: 'get_user_id_age',
    age: age,
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

  dispose(): void {
    this.chromiumosFeatures?.dispose();
    vscode.Disposable.from(...this.subscriptions.reverse()).dispose();
  }

  constructor(
    context: vscode.ExtensionContext,
    statusManager: bgTaskStatus.StatusManager,
    boilerplateInserter: boilerplate.BoilerplateInserter,
    cipdRepository: cipd.CipdRepository,
    chromiumosServices: services.chromiumos.ChromiumosServiceModule,
    cppXrefs: CppXrefs
  ) {
    this.subscriptions.push(
      this.watcher.onDidChangeRoot(root => {
        this.chromiumosFeatures?.dispose();
        this.chromiumosFeatures = root
          ? new features.Chromiumos(
              context,
              root,
              statusManager,
              boilerplateInserter,
              cipdRepository,
              chromiumosServices,
              cppXrefs
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

  dispose(): void {
    this.chromiumFeatures?.dispose();
    vscode.Disposable.from(...this.subscriptions.reverse()).dispose();
  }

  constructor(
    context: vscode.ExtensionContext,
    statusManager: bgTaskStatus.StatusManager,
    boilerplateInserter: boilerplate.BoilerplateInserter,
    cppXrefs: CppXrefs
  ) {
    this.subscriptions.push(
      this.watcher.onDidChangeRoot(root => {
        this.chromiumFeatures?.dispose();
        this.chromiumFeatures = root
          ? new features.Chromium(
              context,
              root,
              statusManager,
              boilerplateInserter,
              cppXrefs
            )
          : undefined;
      })
    );
  }
}

async function assertOutsideChroot() {
  if (!(await commonUtil.isInsideChroot())) {
    return;
  }
  void (async () => {
    const openDocument = 'Open document';
    const choice = await vscode.window.showWarningMessage(
      'Support for running VSCode inside chroot is dropped in the next release that comes soon; please read go/chromiumide-quickstart and update your setup.',
      {modal: true},
      openDocument
    );
    if (choice === openDocument) {
      void vscode.env.openExternal(
        vscode.Uri.parse('http://go/chromiumide-quickstart')
      );
    }
  })();
}
