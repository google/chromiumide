// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as net from 'net';
import {findUnusedPort} from '../../../../common/net_util';
import {ChrootService} from '../../../../services/chromiumos';
import {ChrootGdbSpawner} from './chroot_gdb';

export class GdbShimServerStarter {
  constructor(
    private readonly chrootService: ChrootService,
    private readonly chrootGdbSpawner = new ChrootGdbSpawner(chrootService)
  ) {}

  /**
   * Creates a server that speaks GDB protocol, which is a shim of a gdb process in chroot, and
   * translates the filepaths in chroot to the corresponding ones outside chroot. Overall, the
   * server behaves as if it's running a gdb outside chroot.
   */
  async start(chrootGdbArgs: string[]): Promise<GdbShimServer | Error> {
    const chrootGdb = await this.chrootGdbSpawner.spawn(chrootGdbArgs);
    if (chrootGdb instanceof Error) {
      return chrootGdb;
    }

    const server = net.createServer(socket => {
      // TODO(b/227137453): Deal with the possible case where a message is cut in the middle and
      // path substitution doesn't work.
      chrootGdb.stdout.on('data', (data: Buffer) => {
        const x: string = data.toString('utf8');

        const y = this.translateFromChroot(x);

        if (x === y) {
          // Write the data as is just in case the conversion to a string was lossy (it wouldn't,
          // according to the gdb protocol, though).
          socket.write(data);
          return;
        }
        socket.write(y, 'utf8');
      });
      socket.on('data', data => {
        const x = data.toString('utf8');

        const y = this.translateToChroot(x);

        if (x === y) {
          chrootGdb.stdin.write(data);
          return;
        }
        chrootGdb.stdin.write(y, 'utf8');
      });
      socket.on('close', () => {
        server.close();
      });
    });
    server.on('close', () => {
      chrootGdb.kill();
    });

    const serverPort = await findUnusedPort();

    return new Promise(resolve => {
      server.listen(serverPort, () => {
        resolve(new GdbShimServer(server, serverPort));
      });
    });
  }

  private translateFromChroot(output: string): string {
    return output.replace(/(?<=")(.*?)(?=")/g, (_m, filepath) =>
      this.chrootService.translatePathFromChroot(filepath)
    );
  }

  private translateToChroot(input: string): string {
    return input.replace(/(?<=")(.*?)(?=")/g, (_m, filepath) =>
      this.chrootService.translatePathToChroot(filepath)
    );
  }
}

export class GdbShimServer {
  constructor(private readonly server: net.Server, readonly port: number) {}

  close(): void {
    this.server.close();
  }

  onClose(callback: () => void): void {
    this.server.on('close', callback);
  }
}
