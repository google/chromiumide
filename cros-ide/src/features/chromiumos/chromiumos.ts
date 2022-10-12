// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as services from '../../services';
import * as bgTaskStatus from '../../ui/bg_task_status';
import * as boardsPackages from './boards_packages';
import * as cppCodeCompletion from './cpp_code_completion';
import {NewFileTemplate} from './new_file_template';

/**
 * The root class of all the ChromiumOS features.
 *
 * This class should be instantiated only when the workspace contains chromiumos source code.
 */
export class Chromiumos implements vscode.Disposable {
  private readonly subscriptions: vscode.Disposable[] = [
    new NewFileTemplate(this.root),
  ];

  /**
   * @param root Absolute path to the chormiumos root directory.
   */
  constructor(
    private readonly root: string,
    statusManager: bgTaskStatus.StatusManager
  ) {
    const chrootService = services.chromiumos.ChrootService.maybeCreate(
      this.root
    );
    if (chrootService) {
      cppCodeCompletion.activate(
        this.subscriptions,
        statusManager,
        chrootService
      );
      void boardsPackages.activate(this.subscriptions, chrootService);
    }
  }

  dispose() {
    vscode.Disposable.from(...this.subscriptions.reverse()).dispose();
  }
}
