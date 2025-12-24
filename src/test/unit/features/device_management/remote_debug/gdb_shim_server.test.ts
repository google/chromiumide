// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as net from 'net';
import * as path from 'path';
import * as stream from 'stream';
import * as vscode from 'vscode';
import {
  ChrootGdb,
  ChrootGdbSpawner,
} from '../../../../../features/device_management/commands/remote_debug/chroot_gdb';
import {GdbShimServerStarter} from '../../../../../features/device_management/commands/remote_debug/gdb_shim_server';
import {ChrootService} from '../../../../../services/chromiumos';
import * as testing from '../../../../testing';

describe('GdbShimServer', () => {
  const tempDir = testing.tempDir();

  const state = testing.cleanState(async () => {
    const chromiumosRoot = path.join(tempDir.path, 'chromiumos');
    await testing.buildFakeChromeos(chromiumosRoot);
    const chrootService = ChrootService.maybeCreate(chromiumosRoot, false)!;
    return {
      chromiumosRoot,
      chrootService,
    };
  });

  const subscriptions: vscode.Disposable[] = [];
  afterEach(() => {
    vscode.Disposable.from(...subscriptions.splice(0).reverse()).dispose();
  });

  it('proxies with translating paths', async () => {
    const gdbStdio = new stream.PassThrough();

    const gdbKillWaiter = await testing.BlockingPromise.new(undefined);
    const fakeChrootGdb = {
      stdin: gdbStdio as stream.Writable,
      stdout: gdbStdio as stream.Readable,
      kill() {
        gdbKillWaiter.unblock();
      },
    } as ChrootGdb;

    const chrootGdbArgs: string[][] = [];
    const fakeChrootGdbSpawner = {
      spawn(args) {
        chrootGdbArgs.push(args);
        return Promise.resolve(fakeChrootGdb);
      },
    } as ChrootGdbSpawner;

    const args = ['foo', 'bar'];
    const server = await new GdbShimServerStarter(
      state.chrootService,
      fakeChrootGdbSpawner
    ).start(args);
    if (server instanceof Error) {
      fail(`failed to start server: ${server}`);
      return;
    }
    subscriptions.push(new vscode.Disposable(() => server.close()));

    const socket = net.connect({
      port: server.port,
    });

    await new Promise(resolve => socket.on('connect', resolve));

    const testCases = [
      ['"/mnt/host/source/foo.cc"\n', `"${state.chromiumosRoot}/foo.cc"\n`],
      [
        '"/build/brya/foo.cc"\n',
        `"${state.chromiumosRoot}/out/build/brya/foo.cc"\n`,
      ],
      [
        '"/var/lib/foo.cc"\n',
        `"${state.chromiumosRoot}/chroot/var/lib/foo.cc"\n`,
      ],
      // A packet may contain multiple filepaths.
      [
        '{foo:"/build/brya/foo.cc",bar:"/mnt/host/source/foo.cc"}\n',
        `{foo:"${state.chromiumosRoot}/out/build/brya/foo.cc",bar:"${state.chromiumosRoot}/foo.cc"}\n`,
      ],
    ];

    for (const [chrootOutput, hostOutput] of testCases) {
      gdbStdio.write(chrootOutput);

      await new Promise(resolve => socket.on('readable', resolve));

      expect(socket.read().toString('utf8')).toEqual(hostOutput);
    }

    for (const [chrootInput, hostInput] of testCases) {
      socket.write(hostInput);

      await new Promise(resolve => gdbStdio.on('readable', resolve));

      expect(gdbStdio.read().toString('utf8')).toEqual(chrootInput);
    }

    socket.end();
    await gdbKillWaiter.promise;
  });
});
