// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {ReactPanel} from '../../../../services/react_panel';
import {
  AddOwnedDeviceViewContext,
  DutConnectionConfig,
} from './add_owned_device_model';
import {AddOwnedDeviceService} from './add_owned_device_service';

/** A message from the webview to test the connection. */
interface TestDeviceConnectionMessage {
  command: 'testDeviceConnection';
  config: DutConnectionConfig;
}

/** A message from the webview to finish adding the device. */
interface FinishMessage {
  command: 'finish';
}

/** A message from the webview. */
type ViewMessage = TestDeviceConnectionMessage | FinishMessage;

export class AddOwnedDevicePanel extends ReactPanel<AddOwnedDeviceViewContext> {
  constructor(
    extensionUri: vscode.Uri,
    private readonly service: AddOwnedDeviceService,
    context: AddOwnedDeviceViewContext
  ) {
    super('add_owned_device_view', extensionUri, 'Add Owned Device', context);
  }

  protected handleWebviewMessage(message: ViewMessage): void {
    switch (message.command) {
      case 'testDeviceConnection':
        void this.configureAndTestConnection(message.config);
        break;
      case 'finish':
        void this.finish();
    }
  }

  private async configureAndTestConnection(
    config: DutConnectionConfig
  ): Promise<void> {
    try {
      const info = await this.service.configureAndTestConnection(config);
      await this.panel.webview.postMessage({
        command: 'deviceConnected',
        info: info,
      });
    } catch (error) {
      await this.panel.webview.postMessage({
        command: 'unableToConnect',
        error: JSON.stringify(error),
      });
    }
  }

  private async finish() {
    // Close the view (is there a more direct way?)
    this.panel.reveal();
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  }
}
