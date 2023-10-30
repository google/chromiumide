// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {ReactPanel} from '../../../../services/react_panel';
import {BuildInfoService} from '../build_info_service';
import * as model from './builds_browser_model';

export class BuildsBrowserPanel extends ReactPanel<model.BuildsBrowserState> {
  constructor(
    extensionUri: vscode.Uri,
    private buildInfoService: BuildInfoService
  ) {
    super('builds_browser_view', extensionUri, 'ChromeOS Builds', {
      board: '',
      builds: [],
      loadingBuilds: true,
    });
  }

  protected handleWebviewMessage(
    message: model.BuildsBrowserViewMessage
  ): void {
    switch (message.command) {
      case 'LoadBuilds':
        this.buildInfoService
          .loadBuildInfos('')
          .then(builds => {
            void this.panel.webview.postMessage({
              command: 'UpdateBuildsBrowserState',
              state: {
                board: '',
                builds: builds,
                loadingBuilds: false,
              },
            });
          })
          .catch(reason => {
            void vscode.window.showErrorMessage(
              `Error loading builds information.\n${reason}`
            );
          });
        break;
      case 'BuildChosen':
        break;
    }
  }
}
