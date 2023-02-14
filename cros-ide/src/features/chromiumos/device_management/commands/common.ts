// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as abandonedDevices from '../abandoned_devices';
import * as crosfleet from '../crosfleet';
import * as repository from '../device_repository';
import * as provider from '../device_tree_data_provider';
import * as sshConfig from '../ssh_config';
import * as ssh from '../ssh_session';
import * as vnc from '../vnc_session';

/**
 * Contains various values commonly available to commands.
 */
export interface CommandContext {
  readonly extensionContext: vscode.ExtensionContext;
  readonly output: vscode.OutputChannel;
  readonly deviceRepository: repository.DeviceRepository;
  readonly crosfleetRunner: crosfleet.CrosfleetRunner;
  readonly vncSessions: Map<string, vnc.VncSession>;
  readonly sshSessions: Map<string, ssh.SshSession>;
  readonly abandonedDevices: abandonedDevices.AbandonedDevices;
}

export async function promptNewHostname(
  title: string,
  ownedDeviceRepository: repository.OwnedDeviceRepository
): Promise<string | undefined> {
  const suggestedHosts = await sshConfig.readUnaddedSshHosts(
    ownedDeviceRepository
  );
  return await showInputBoxWithSuggestions(suggestedHosts, {
    title,
    placeholder: 'host[:port]',
  });
}

/**
 * Prompt known hostnames on quick pick or shows an error
 * if no devices are set up.
 */
export async function promptKnownHostnameIfNeeded(
  title: string,
  item: provider.DeviceItem | undefined,
  deviceRepository:
    | repository.DeviceRepository
    | repository.OwnedDeviceRepository
    | repository.LeasedDeviceRepository
): Promise<string | undefined> {
  if (item) {
    return item.hostname;
  }

  const devices = await deviceRepository.getDevices();
  const hostnames = devices.map(device => device.hostname);
  if (hostnames.length > 0) {
    return await vscode.window.showQuickPick(hostnames, {
      title,
    });
  }
  const CONFIGURE = 'Configure';
  void (async () => {
    const action = await vscode.window.showErrorMessage(
      'No device has been configured yet',
      CONFIGURE
    );
    if (action === CONFIGURE) {
      await vscode.commands.executeCommand(
        'workbench.view.extension.cros-view'
      );
    }
  })();
  return undefined;
}

class SimplePickItem implements vscode.QuickPickItem {
  constructor(public readonly label: string) {}
}

interface InputBoxWithSuggestionsOptions {
  title?: string;
  placeholder?: string;
}

/**
 * Shows an input box with suggestions.
 *
 * It is actually a quick pick that shows the user input as the first item.
 * Idea is from:
 * https://github.com/microsoft/vscode/issues/89601#issuecomment-580133277
 */
export function showInputBoxWithSuggestions(
  labels: string[],
  options?: InputBoxWithSuggestionsOptions
): Promise<string | undefined> {
  const labelSet = new Set(labels);

  return new Promise(resolve => {
    const subscriptions: vscode.Disposable[] = [];

    const picker = vscode.window.createQuickPick();
    if (options !== undefined) {
      Object.assign(picker, options);
    }
    picker.items = labels.map(label => new SimplePickItem(label));

    subscriptions.push(
      picker.onDidChangeValue(() => {
        if (!labelSet.has(picker.value)) {
          picker.items = [picker.value, ...labels].map(
            label => new SimplePickItem(label)
          );
        }
      }),
      picker.onDidAccept(() => {
        const choice = picker.activeItems[0];
        picker.hide();
        picker.dispose();
        vscode.Disposable.from(...subscriptions).dispose();
        resolve(choice.label);
      })
    );

    picker.show();
  });
}
