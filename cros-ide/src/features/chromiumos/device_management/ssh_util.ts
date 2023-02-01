// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';

/**
 * Options of an entry in an OpenSSH config file.
 *
 * Not all available OpenSSH options are here; they can be added as needed.
 */
export type SshConfigHost = {
  readonly Hostname?: string;
  readonly Port?: number;
  readonly CheckHostIP?: string;
  readonly ControlMaster?: string;
  readonly ControlPath?: string;
  readonly ControlPersist?: string;
  readonly IdentitiesOnly?: string;
  readonly IdentityFile?: string;
  readonly StrictHostKeyChecking?: string;
  readonly User?: string;
  readonly UserKnownHostsFile?: string;
  readonly VerifyHostKeyDNS?: string;
  readonly ProxyCommand?: string;
  readonly HostKeyAlias?: string;
};

/**
 * An entry in an OpenSSH config file (with a single host), including the Host part at the top.
 * Currently this is designed for use with the ssh-config lib.
 */
export type SshConfigHostEntry = SshConfigHost & {
  readonly Host?: string;
};

// Used to prevent any extra object properties from being used as -o on ssh cli.
const SUPPORTED_SSH_HYPHEN_O_OPTIONS: (keyof SshConfigHost)[] = [
  'Hostname',
  'Port',
  'CheckHostIP',
  'ControlMaster',
  'ControlPath',
  'ControlPersist',
  'IdentitiesOnly',
  'IdentityFile',
  'StrictHostKeyChecking',
  'User',
  'UserKnownHostsFile',
  'VerifyHostKeyDNS',
  'ProxyCommand',
  'HostKeyAlias',
];

/**
 * Returns the path to the testing_rsa file bundled in the extension.
 *
 * The activation function of the device management feature ensures that the file
 * has a safe permission (0600).
 */
export function getTestingRsaPath(extensionUri: vscode.Uri): string {
  return vscode.Uri.joinPath(extensionUri, 'resources', 'testing_rsa').fsPath;
}

/**
 * Constructs a command line to run SSH for a host.
 *
 * @param hostAndPort in the format of 'hostname' or 'hostname:port'
 * @param extensionUri extension's installation path
 * @param extraOptions additional SSH options for your command
 * @param cmd remote command to execute
 * @returns a command line
 */
export function buildSshCommand(
  hostAndPort: string,
  extensionUri: vscode.Uri,
  extraOptions: string[] = [],
  cmd?: string
): string[] {
  const sshCmd = ['ssh'].concat(
    buildMinimalDeviceSshArgs(hostAndPort, extensionUri, extraOptions)
  );
  if (cmd) {
    sshCmd.push(cmd);
  }
  return sshCmd;
}

/**
 * Builds the arguments needed to SSH to a DUT. Works with leased devices, but may not work for all
 * owned device situations.
 *
 * @param hostAndPort Host name, or colon-separated host and port.
 * @param extensionUri cros-ide extension URI.
 * @returns string[] of the individual arguments.
 */
export function buildMinimalDeviceSshArgs(
  hostAndPort: string,
  extensionUri: vscode.Uri,
  extraOptions: string[] = []
): string[] {
  const [host, port] = hostAndPort.split(':');
  const testingRsaPath = getTestingRsaPath(extensionUri);
  return buildSshArgs(
    host,
    port ? Number(port) : undefined,
    {
      StrictHostKeyChecking: 'no', // Prevent prompting whether to add new host to knowns.
      UserKnownHostsFile: '/dev/null', // Don't modify the user's known_hosts file.
    },
    ['-i', testingRsaPath].concat(extraOptions)
  );
}

/**
 * Builds OpenSSH ssh args, for the given host, and optional port, SSH config options, and
 * additional args.
 *
 * @param host Hostname (no port number)
 * @param port Port number, or undefined (SSH defaults to 22)
 * @param sshOptions SSH config options, which will add corresponding -o args.
 * @return string[] of the individual arguments.
 */
export function buildSshArgs(
  host: string,
  port?: number,
  sshOptions: SshConfigHost = {},
  additionalSshArgs: string[] = []
): string[] {
  const sshArgs: string[] = [];
  if (port) {
    sshArgs.push('-p', port.toString());
  }
  sshArgs.push(...additionalSshArgs);
  sshArgs.push(
    ...Object.entries(sshOptions)
      .filter(
        e =>
          e[1] &&
          SUPPORTED_SSH_HYPHEN_O_OPTIONS.includes(e[0] as keyof SshConfigHost)
      )
      .flatMap(e => ['-o', `${e[0]}=${e[1]}`])
  );
  sshArgs.push(`root@${host}`);
  return sshArgs;
}
