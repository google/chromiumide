// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as path from 'path';
import * as vscode from 'vscode';
import {getDriver} from '../../../shared/app/common/driver_repository';
import * as config from '../../../shared/app/services/config';
import * as bgTaskStatus from '../../../shared/app/ui/bg_task_status';
import {getUiLogger} from '../../../shared/app/ui/log';
import {CppXrefs} from '../../common/cpp_xrefs/cpp_xrefs';
import {CustomContext} from '../../common/when_clause_context';
import * as boilerplate from '../boilerplate';
import * as chromiumBuild from './chromium_build';
import {ChromiumCppXrefs} from './cpp_xrefs';
import * as format from './format';
import * as gtest from './gtest';
import * as java from './java';
import * as outputDirectories from './output_directories';
import * as relatedFiles from './related_files';
import * as terminalLinks from './terminal_links';

const driver = getDriver();

/**
 * Extension context value provided to this class. We omit subscriptions here
 * because the lifetime of the context might be longer than this class and thus
 * we should not put disposables created under this class to
 * context.subscriptions.
 */
type Context = Omit<vscode.ExtensionContext, 'subscriptions'>;

/**
 * The root class of all the Chromium features.
 *
 * This class should be instantiated only when the workspace contains chromium source code.
 */
export class Chromium implements vscode.Disposable {
  private readonly subscriptions: vscode.Disposable[] = [
    this.boilerplateInserter.addBoilerplateGenerator(
      new boilerplate.ChromiumBoilerplateGenerator(path.join(this.root, 'src'))
    ),
  ];
  dispose(): void {
    vscode.Disposable.from(...this.subscriptions.reverse()).dispose();
  }

  /**
   * @param context The context of the extension itself.
   * @param root Absolute path to the chromium root directory.
   */
  constructor(
    context: Context,
    private readonly root: string,
    private readonly statusManager: bgTaskStatus.StatusManager,
    private readonly boilerplateInserter: boilerplate.BoilerplateInserter,
    private readonly cppXrefs: CppXrefs
  ) {
    getUiLogger().appendLine('Enabling chromium features: root = ' + root);
    void (async () => {
      try {
        // The method shouldn't throw an error as its API contract.
        await this.activate(context);
      } catch (e) {
        console.error('Failed to activate chromium features', e);
        driver.metrics.send({
          category: 'error',
          group: 'misc',
          description: `failed to activte chromium feature ${this.featureName}`,
          name: 'misc_error_active_chromium_feature',
          feature: this.featureName,
        });
      }
    })();
  }

  // feature name being activated to include in error message
  private featureName = 'Chromium';

  private async activate(context: Context) {
    const ephemeralContext = newContext(context, this.subscriptions);

    if (config.underDevelopment.chromiumBuild.get()) {
      this.featureName = 'chromiumBuild';
      chromiumBuild.activate(ephemeralContext, this.statusManager);
    }
    if (config.chromium.java.enabled.get()) {
      this.featureName = 'chromiumJavaSupport';
      java.activate(ephemeralContext, this.root, this.statusManager);
    }
    if (config.chrome.outputDirectories.get()) {
      this.featureName = 'chromiumOutputDirectories';
      outputDirectories.activate(
        ephemeralContext,
        this.statusManager,
        this.root
      );
    }

    this.featureName = 'chromiumContextKeys';
    await CustomContext.chromiumSrcUris.set(
      [
        vscode.Uri.file(path.join(this.root, 'src')),
        vscode.Uri.file(path.join(this.root, 'src-internal')),
      ],
      ephemeralContext.subscriptions
    );

    this.featureName = 'chromiumFormat';
    format.activate(ephemeralContext, this.root);

    this.featureName = 'relatedFiles';
    relatedFiles.activate(ephemeralContext, path.join(this.root, 'src'));

    if (config.chrome.gtest.enabled.get()) {
      this.featureName = 'chromiumGtest';
      this.subscriptions.push(
        new gtest.ChromiumGtest(path.join(this.root, 'src'))
      );
    }

    this.featureName = 'chromiumCppXrefs';
    new ChromiumCppXrefs(this.root, this.cppXrefs);

    this.featureName = 'chromiumTerminalLinks';
    terminalLinks.activate(ephemeralContext, path.join(this.root, 'src'));
  }
}

// TODO(oka): The same function exists in chromiumos.ts. Move the function to a
// common place and share it.
function newContext(
  context: Context,
  subscriptions: vscode.Disposable[]
): vscode.ExtensionContext {
  return {
    environmentVariableCollection: context.environmentVariableCollection,
    extension: context.extension,
    extensionMode: context.extensionMode,
    extensionPath: context.extensionPath,
    extensionUri: context.extensionUri,
    globalState: context.globalState,
    globalStoragePath: context.globalStoragePath,
    globalStorageUri: context.globalStorageUri,
    logPath: context.logPath,
    logUri: context.logUri,
    secrets: context.secrets,
    storagePath: context.storagePath,
    storageUri: context.storageUri,
    subscriptions,
    workspaceState: context.workspaceState,
    asAbsolutePath: context.asAbsolutePath.bind(context),
  };
}
