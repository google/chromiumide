// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as ssh from 'ssh2';
import {SshIdentity} from '../../../../../features/device_management/ssh_identity';
import type * as vscode from 'vscode';

const FAKE_SSH_HOST_KEY = `-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW
QyNTUxOQAAACCFFcEwNvRhAnwGgyyr8BJzApEC1MaZIWoJp9rQosIecAAAALBLnGo3S5xq
NwAAAAtzc2gtZWQyNTUxOQAAACCFFcEwNvRhAnwGgyyr8BJzApEC1MaZIWoJp9rQosIecA
AAAEBwX8Fk7FGl/3alxILUGYRnYSPIv3AX+25DknNCVfwRboUVwTA29GECfAaDLKvwEnMC
kQLUxpkhagmn2tCiwh5wAAAAJ255YUBueWEtbWFjYm9va3Byby5yb2FtLmNvcnAuZ29vZ2
xlLmNvbQECAwQFBg==
-----END OPENSSH PRIVATE KEY-----
`;

const LSB_RELEASE = `DEVICETYPE=CHROMEBOOK
CHROMEOS_RELEASE_NAME=Chrome OS
CHROMEOS_AUSERVER=https://tools.google.com/service/update2
CHROMEOS_DEVSERVER=
CHROMEOS_ARC_VERSION=8681831
CHROMEOS_ARC_ANDROID_SDK_VERSION=30
CHROMEOS_RELEASE_BUILDER_PATH=hatch-release/R104-14901.0.0
CHROMEOS_RELEASE_KEYSET=devkeys
CHROMEOS_RELEASE_TRACK=testimage-channel
CHROMEOS_RELEASE_BUILD_TYPE=Official Build
CHROMEOS_RELEASE_DESCRIPTION=14901.0.0 (Official Build) dev-channel hatch test
CHROMEOS_RELEASE_BOARD=hatch
CHROMEOS_RELEASE_BRANCH_NUMBER=0
CHROMEOS_RELEASE_BUILD_NUMBER=14901
CHROMEOS_RELEASE_CHROME_MILESTONE=104
CHROMEOS_RELEASE_PATCH_NUMBER=0
CHROMEOS_RELEASE_VERSION=14901.0.0
GOOGLE_RELEASE=14901.0.0
CHROMEOS_RELEASE_UNIBUILD=1
`;

const DLV_VERSION = `Delve Debugger
Version: 1.21.0
Build: $Id: fec0d226b2c2cce1567d5f59169660cf61dc1efe $
`;

/**
 * Fake SSH server that handles exec requests.
 */
export class FakeSshServer implements vscode.Disposable {
  private readonly server: ssh.Server;

  constructor() {
    this.server = new ssh.Server({
      hostKeys: [FAKE_SSH_HOST_KEY],
    });
    this.server.on('connection', client => {
      client.on('error', () => {
        // Ignore socket errors.
      });

      client.on('authentication', ctx => {
        ctx.accept();
      });

      client.on('ready', () => {
        client.on('session', (accept, _reject) => {
          const session = accept();
          session.on('exec', (accept, _reject, info) => {
            const channel = accept();
            switch (info.command) {
              case 'cat /etc/lsb-release':
                channel.write(LSB_RELEASE);
                channel.exit(0);
                channel.end();
                break;
              case 'dlv version':
                channel.write(DLV_VERSION);
                channel.exit(0);
                channel.end();
                break;
              default:
                console.error(`Unknown command: ${info.command}\n`);
                channel.exit(255);
                channel.end();
                break;
            }
          });
          session.on('shell', accept => accept());
        });

        client.on('tcpip', accept => {
          const channel = accept();
          channel.write('SSH-2.0-fake\r\n');
        });
      });
    });
  }

  listen(listenPort?: number): Promise<void> {
    return new Promise<void>(resolve => {
      this.server.listen(listenPort ?? 0, 'localhost', resolve);
    });
  }

  get listenPort(): number {
    return this.server.address().port;
  }

  /** SSH identity that can be used to connect to this server. */
  get sshIdentity(): SshIdentity {
    return {
      get filePaths(): string[] {
        return [];
      },
    } as SshIdentity;
  }

  dispose(): void {
    this.server.close();
  }
}
