// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import {processExists, killGracefully} from '../../../common/processes';
import * as testing from '../../testing';

// This test suite relies on real timer. Make sure each test case finishes in 100ms without flakes
// and don't add many test cases.
describe('killGracefully', () => {
  const tempDir = testing.tempDir();

  const {vscodeSpy} = testing.installVscodeDouble();

  /** Spawn a process that sleeps ignoring SIGTERM. */
  async function spawnDeepSleep(): Promise<number> {
    const sleep = path.join(tempDir.path, 'sleep.sh');

    await fs.promises.writeFile(
      sleep,
      `#!/bin/bash

trap ':' SIGTERM

echo ok

sleep 1
`
    );

    await fs.promises.chmod(sleep, 0o755);

    const proc = childProcess.spawn(sleep, {
      stdio: 'pipe',
    });
    return new Promise(resolve => {
      proc.stdout.on('data', () => {
        resolve(proc.pid!);
      });
    });
  }

  it('kills process by sending SIGTERM only', async () => {
    const proc = childProcess.spawn('sleep', ['1']);

    const pid = proc.pid!;

    expect(
      await killGracefully(
        {
          pid,
          name: 'sleep',
        },
        {
          timeout: {
            SIGTERM: 25,
            SIGKILL: -1, // don't send SIGKILL
          },
          interval: 10,
        }
      )
    ).toBeTrue();

    expect(processExists(pid)).toBeFalse();

    expect(vscodeSpy.window.showInformationMessage).toHaveBeenCalledOnceWith(
      jasmine.stringContaining('Killed sleep')
    );
  }, 100);

  it('kills process by sending SIGTERM and SIGKILL', async () => {
    const pid = await spawnDeepSleep();

    expect(
      await killGracefully(
        {
          pid,
          name: 'deep-sleep',
        },
        {
          timeout: {
            SIGTERM: 25,
            SIGKILL: 25,
          },
          interval: 10,
        }
      )
    ).toBeTrue();

    expect(processExists(pid)).toBeFalse();

    expect(vscodeSpy.window.showInformationMessage).toHaveBeenCalledOnceWith(
      jasmine.stringContaining('Killed deep-sleep')
    );
  }, 100);

  it('returns false if process is not killed', async () => {
    const pid = await spawnDeepSleep();

    expect(
      await killGracefully(
        {
          pid,
          name: 'deep-sleep',
        },
        {
          timeout: {
            SIGTERM: 25,
            SIGKILL: -1, // don't send SIGKILL
          },
          interval: 10,
        }
      )
    ).toBeFalse();

    expect(processExists(pid)).toBeTrue();

    expect(vscodeSpy.window.showErrorMessage).toHaveBeenCalledOnceWith(
      jasmine.stringContaining('Failed to kill deep-sleep')
    );

    process.kill(pid, 'SIGKILL');
    while (processExists(pid)) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }, 100);
});
