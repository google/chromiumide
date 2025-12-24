// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as childProcess from 'child_process';
import * as path from 'path';
import * as stream from 'stream';
import {ChrootService} from '../../../../services/chromiumos';
import {execSudo} from '../../../../services/sudo';

const GDB_IN_CHROOT = '/usr/bin/gdb';

/**
 * Runs gdb inside chroot and returns an object for controlling it.
 */
export class ChrootGdbSpawner {
  constructor(private readonly chrootService: ChrootService) {}

  async spawn(gdbArgs: string[]): Promise<ChrootGdb | Error> {
    // TODO(b/227137453): More robustly spawn the command under sudo. Consider adding a spawn method
    // in chrootService, and unit-testing this method.
    const check = await execSudo('true', [], {
      sudoReason: 'to spawn gdb in chroot',
    });
    if (check instanceof Error) {
      return check;
    }

    const crosSdk = path.join(
      this.chrootService.chromiumosRoot,
      'chromite/bin/cros_sdk'
    );
    const gdbCommand = ['sudo', crosSdk, '--', GDB_IN_CHROOT, ...gdbArgs];

    const process = childProcess.spawn(gdbCommand[0], gdbCommand.slice(1), {
      stdio: 'pipe',
    });
    return new ChrootGdb(process);
  }
}

/** A wrapper of a gdb process in chroot that allows tests to fake it easily. */
export class ChrootGdb {
  constructor(private readonly process: childProcess.ChildProcess) {}

  get stdin(): stream.Writable {
    return this.process.stdin!;
  }

  get stdout(): stream.Readable {
    return this.process.stdout!;
  }

  kill(): void {
    try {
      this.process?.kill();
    } catch (_e) {
      // The process has been killed already.
    }
  }
}
