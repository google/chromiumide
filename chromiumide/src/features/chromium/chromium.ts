// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as path from 'path';
import * as vscode from 'vscode';
import * as config from '../../services/config';
import * as bgTaskStatus from '../../ui/bg_task_status';
import * as boilerplate from '../boilerplate';
import {Metrics} from '../metrics/metrics';
import * as chromiumBuild from './chromium_build';
import * as format from './format';
import * as gtest from './gtest';
import * as outputDirectories from './output_directories';
import * as relatedFiles from './related_files';

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
    private readonly boilerplateInserter: boilerplate.BoilerplateInserter
  ) {
    void (async () => {
      try {
        // The method shouldn't throw an error as its API contract.
        await this.activate(context);
      } catch (e) {
        console.error('Failed to activate chromium features', e);
        Metrics.send({
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
    if (config.chrome.outputDirectories.get()) {
      this.featureName = 'chromiumOutputDirectories';
      outputDirectories.activate(
        ephemeralContext,
        this.statusManager,
        this.root
      );
    }

    this.featureName = 'chromiumContextKeys';
    // This can be used in `when` clauses in `package.json`. It is okay to never reset it back to
    // an empty array, even when the user removes the Chromium folder from their workspace,
    // because the fact that Chromium is located in these directories probably doesn't change.
    await vscode.commands.executeCommand(
      'setContext',
      'chromiumide.chromium.src-uris',
      [
        vscode.Uri.file(path.join(this.root, 'src')),
        vscode.Uri.file(path.join(this.root, 'src-internal')),
      ]
    );

    this.featureName = 'chromiumFormat';
    format.activate(ephemeralContext, this.root);
    // TODO(cmfcmf): This is Chromium-only for now, but we should also consider enabling it for
    // other repos once we understand their file structures better.
    if (config.underDevelopment.relatedFiles.get()) {
      this.featureName = 'relatedFiles';
      relatedFiles.activate(ephemeralContext);
    }

    if (config.chrome.gtest.enabled.get()) {
      this.featureName = 'chromiumGtest';
      this.subscriptions.push(
        new gtest.ChromiumGtest(path.join(this.root, 'src'))
      );
    }
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
