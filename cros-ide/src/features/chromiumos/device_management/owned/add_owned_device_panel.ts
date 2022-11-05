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
        void this.tryConfigureAndTestConnection(message.config);
        break;
      case 'finish':
        void this.finish();
    }
  }

  /**
   * Runs the connection test step, applying other optional operations such as updating the SSH
   * config file. If the connection fails, an error is thrown, and changes are rolled back.
   *
   * TODO(joelbecker): Apply SSH config changes after connection succeeds, once we do not rely on it
   * for connection.
   *
   * @return string device info if connection is successful.
   * @throws Error if unable to connect, or unable to update the SSH config file.
   */
  async configureAndTestConnection(config: DutConnectionConfig): Promise<void> {
    await this.service.tryToConnect(config);
    if (config.addToSshConfig) {
      this.service.addHostToSshConfig(config);
    }
    if (config.addToHostsFile) {
      // TODO(joelbecker): this.addToHostsFile(config); // but with execSudo() or the like
    }
    await this.service.addDeviceToRepository(config.hostname);
  }

  private async tryConfigureAndTestConnection(
    config: DutConnectionConfig
  ): Promise<void> {
    try {
      await this.configureAndTestConnection(config);
      await this.panel.webview.postMessage({
        command: 'deviceConnected',
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
