// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {vscodeRegisterCommand} from '../common/vscode/commands';
import {Metrics} from '../features/metrics/metrics';

export function activate(context: vscode.ExtensionContext): void {
  const commandLink: [string, vscode.Uri][] = [
    [
      'chromiumide.showHelpForBoardsPackages',
      vscode.Uri.parse('http://go/chromiumide-doc-boards-pkgs'),
    ],
    [
      'chromiumide.showHelpForDevices',
      vscode.Uri.parse('http://go/chromiumide-doc-device-management'),
    ],
    [
      'chromiumide.showHelpForIdeStatus',
      vscode.Uri.parse('http://go/chromiumide-doc-ide-status'),
    ],
    [
      'chromiumide.showHelpForGerrit',
      vscode.Uri.parse('http://go/chromiumide-doc-gerrit'),
    ],
    [
      'chromiumide.showHelpForLint',
      vscode.Uri.parse('http://go/chromiumide-doc-linting'),
    ],
  ];

  for (const [command, link] of commandLink) {
    context.subscriptions.push(
      vscodeRegisterCommand(command, () => {
        void vscode.env.openExternal(link);
        Metrics.send({
          category: 'interactive',
          group: 'misc',
          description: command,
          name: 'show_help',
        });
      })
    );
  }
}
