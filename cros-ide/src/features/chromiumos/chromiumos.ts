// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as cipd from '../../common/cipd';
import * as services from '../../services';
import * as metrics from '../metrics/metrics';
import * as bgTaskStatus from '../../ui/bg_task_status';
import * as config from '../../services/config';
import * as boardsPackages from './boards_packages';
import * as cppCodeCompletion from './cpp_code_completion';
import * as deviceManagement from './device_management';
import * as tricium from './tricium';
import {NewFileTemplate} from './new_file_template';

/**
 * Extension context value provided to this class. We omit subscriptions here
 * because the lifetime of the context might be longer than this class and thus
 * we should not put disposables created under this class to
 * context.subscriptions.
 */
type Context = Omit<vscode.ExtensionContext, 'subscriptions'>;

/**
 * The root class of all the ChromiumOS features.
 *
 * This class should be instantiated only when the workspace contains chromiumos source code.
 */
export class Chromiumos implements vscode.Disposable {
  private readonly subscriptions: vscode.Disposable[] = [
    new NewFileTemplate(this.root),
  ];
  dispose() {
    vscode.Disposable.from(...this.subscriptions.reverse()).dispose();
  }

  /**
   * @param context The context of the extension itself.
   * @param root Absolute path to the chormiumos root directory.
   */
  constructor(
    context: Context,
    private readonly root: string,
    private readonly statusManager: bgTaskStatus.StatusManager,
    private readonly cipdRepository: cipd.CipdRepository
  ) {
    void (async () => {
      try {
        // The method shouldn't throw an error as its API contract.
        await this.activate(context);
      } catch (_e) {
        metrics.send({
          category: 'error',
          group: 'misc',
          description: `failed to activte ${this.featureName}`,
        });
      }
    })();
  }

  // feature name being activated to include in error message
  private featureName = 'Chromiumos';

  // TODO(oka): Cancel ongoing activation when this class is disposed.
  private async activate(context: Context) {
    const ephemeralContext: vscode.ExtensionContext = Object.assign(
      {},
      context,
      {
        subscriptions: this.subscriptions,
      }
    );

    const chrootService = services.chromiumos.ChrootService.maybeCreate(
      this.root
    );
    if (chrootService) {
      this.featureName = 'cppCodeCompletion';
      cppCodeCompletion.activate(
        this.subscriptions,
        this.statusManager,
        chrootService
      );

      this.featureName = 'boardsPackages';
      await boardsPackages.activate(this.subscriptions, chrootService);

      this.featureName = 'deviceManagement';
      await deviceManagement.activate(
        ephemeralContext,
        this.statusManager,
        chrootService,
        this.cipdRepository
      );

      if (config.underDevelopment.triciumSpellchecker.get()) {
        this.featureName = 'spellchecker';
        await tricium.activateSpellchecker(
          ephemeralContext,
          this.statusManager,
          this.root,
          this.cipdRepository
        );
      }
    }
  }
}
