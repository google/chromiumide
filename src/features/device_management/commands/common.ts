// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {
  QuickPickItemWithPrefillButton,
  SimplePickItem,
  showInputBoxWithSuggestions,
} from '../../../../shared/app/ui/input_box';
import * as netUtil from '../../../common/net_util';
import * as abandonedDevices from '../abandoned_devices';
import * as crosfleet from '../crosfleet';
import * as client from '../device_client';
import * as repository from '../device_repository';
import * as sshConfig from '../ssh_config';
import {SshIdentity} from '../ssh_identity';
import * as ssh from '../ssh_session';
import * as vnc from '../vnc_session';

/**
 * Contains various values commonly available to commands.
 */
export interface CommandContext {
  readonly extensionContext: vscode.ExtensionContext;
  readonly output: vscode.OutputChannel;
  readonly outputBackground: vscode.OutputChannel; // for background operations
  readonly deviceRepository: repository.DeviceRepository;
  readonly crosfleetRunner: crosfleet.CrosfleetRunner;
  readonly vncSessions: Map<string, vnc.VncSession>;
  readonly sshSessions: Map<string, ssh.SshSession>;
  readonly abandonedDevices: abandonedDevices.AbandonedDevices;
  readonly sshIdentity: SshIdentity;
  readonly deviceClient: client.DeviceClient;
}

export async function promptNewHostname(
  title: string,
  ownedDeviceRepository: repository.OwnedDeviceRepository
): Promise<string | undefined> {
  const suggestedHosts = await sshConfig.readUnaddedSshHosts(
    ownedDeviceRepository
  );
  return await showInputBoxWithSuggestions(
    suggestedHosts.map(x => new QuickPickItemWithPrefillButton(x)),
    {
      title,
      placeholder: 'host[:port]',
    }
  );
}

/**
 * Prompt known hostnames on quick pick or shows an error if no devices are set up.
 *
 * @param prioritizeDefaultDevice show the default device on the top of the quickpick list.
 */
export async function promptKnownHostnameIfNeeded(
  title: string,
  hostname: string | undefined,
  deviceRepository:
    | repository.DeviceRepository
    | repository.OwnedDeviceRepository
    | repository.LeasedDeviceRepository,
  prioritizeDefaultDevice = true
): Promise<string | undefined> {
  if (hostname) {
    return hostname;
  }

  const hostnameItems: SimplePickItem[] = [];
  for (const device of await deviceRepository.getDevices()) {
    if (prioritizeDefaultDevice && repository.isDefaultDevice(device)) {
      hostnameItems.unshift(
        new SimplePickItem(device.hostname, undefined, '(default)')
      );
    } else {
      hostnameItems.push(new SimplePickItem(device.hostname));
    }
  }
  if (hostnameItems.length > 0) {
    return (
      await vscode.window.showQuickPick(hostnameItems, {
        title,
        ignoreFocusOut: true,
      })
    )?.label;
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

/**
 * Ensures SSH connection and returns the port for the connection. Returns undefined on failure.
 */
export async function ensureSshSession(
  context: CommandContext,
  hostname: string
): Promise<number | undefined> {
  // Check if we can reuse existing session
  let okToReuseSession = false;
  const existingSession = context.sshSessions.get(hostname);

  if (existingSession) {
    // If tunnel is not up, then do not reuse the session
    const isPortUsed = await netUtil.isPortUsed(existingSession.forwardPort);

    if (isPortUsed) {
      okToReuseSession = true;
    } else {
      existingSession.dispose();
    }
  }

  if (existingSession && okToReuseSession) {
    return existingSession.forwardPort;
  }

  // Create new ssh session.
  const port = await netUtil.findUnusedPort();

  const newSession = await ssh.SshSession.create(
    hostname,
    context.sshIdentity,
    context.output,
    port
  );
  if (!newSession) return undefined;
  newSession.onDidDispose(() => context.sshSessions.delete(hostname));
  context.sshSessions.set(hostname, newSession);

  return port;
}

export function missingInternalRepoErrorMessage(command: string): string {
  return `${command} requires internal chromiumos source code. Please set it up following the official guide, and open a folder in chromiumos repository.`;
}

export async function showMissingInternalRepoErrorMessage(
  command: string
): Promise<void> {
  const openGuide = 'Open guide';
  const openFolder = 'Open folder';

  switch (
    await vscode.window.showErrorMessage(
      missingInternalRepoErrorMessage(command),
      openGuide,
      openFolder
    )
  ) {
    case openGuide:
      await vscode.env.openExternal(
        vscode.Uri.parse(
          'https://chromium.googlesource.com/chromiumos/docs/+/HEAD/developer_guide.md#get-the-source-code'
        )
      );
      break;
    case openFolder:
      await vscode.commands.executeCommand('vscode.openFolder');
      break;
  }
}
