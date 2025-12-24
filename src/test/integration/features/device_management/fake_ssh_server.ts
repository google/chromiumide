// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as net from 'net';
import * as ssh from 'ssh2';

const FAKE_SSH_HOST_KEY = `-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW
QyNTUxOQAAACCFFcEwNvRhAnwGgyyr8BJzApEC1MaZIWoJp9rQosIecAAAALBLnGo3S5xq
NwAAAAtzc2gtZWQyNTUxOQAAACCFFcEwNvRhAnwGgyyr8BJzApEC1MaZIWoJp9rQosIecA
AAAEBwX8Fk7FGl/3alxILUGYRnYSPIv3AX+25DknNCVfwRboUVwTA29GECfAaDLKvwEnMC
kQLUxpkhagmn2tCiwh5wAAAAJ255YUBueWEtbWFjYm9va3Byby5yb2FtLmNvcnAuZ29vZ2
xlLmNvbQECAwQFBg==
-----END OPENSSH PRIVATE KEY-----
`;

const VNC_SERVER_PORT = 5900;

/**
 * Fake SSH server that handles port forward requests to VNC.
 */
export class FakeSshServer {
  private readonly server: ssh.Server;

  constructor(vncPort: number) {
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
        // Respond to the kmsvnc command only.
        client.on('session', (accept, _reject) => {
          const session = accept();
          session.on('exec', (accept, _reject, info) => {
            const channel = accept();
            if (info.command !== 'fuser -k 5900/tcp; kmsvnc') {
              channel.write(`Unknown command: ${info.command}\n`);
              channel.exit(99);
              return;
            }
            channel.write('Starting a fake VNC server\n');
            channel.on('close', () => {
              channel.destroy();
            });
          });
        });

        // Process port forward requests to the VNC server.
        client.on('tcpip', (accept, reject, info) => {
          if (info.destPort !== VNC_SERVER_PORT) {
            reject();
            return;
          }
          const downstream = accept();

          const upstream = net.createConnection(vncPort, 'localhost');

          upstream.on('error', (err: Error) => {
            console.error(err);
          });
          upstream.on('close', () => {
            downstream.close();
          });
          downstream.on('error', (err: Error) => {
            console.error(err);
          });
          downstream.on('close', () => {
            upstream.destroy();
          });

          upstream.on('connect', () => {
            upstream.on('data', (data: Buffer) => {
              downstream.write(data);
            });
            downstream.on('data', (data: Buffer) => {
              upstream.write(data);
            });
          });
        });
      });
    });
  }

  dispose(): void {
    this.server.close();
  }

  listen(listenPort?: number): Promise<void> {
    return new Promise<void>(resolve => {
      this.server.listen(listenPort ?? 0, 'localhost', resolve);
    });
  }

  get listenPort(): number {
    return this.server.address().port;
  }
}
