// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {showInputBoxWithSuggestions} from '../../../../../shared/app/ui/input_box';
import {makeGdbArgsForLaunch} from './chroot_gdb_args';
import {Device} from './device';
import {GdbShimServerStarter} from './gdb_shim_server';

export class RemoteDebug {
  constructor(
    private readonly device: Device,
    private readonly gdbShimServerStarter: GdbShimServerStarter,
    private readonly tempDir = '/tmp'
  ) {}

  async run(): Promise<void> {
    const choice = await vscode.window.showQuickPick([
      {label: 'attach', description: 'attach gdb to a running process'},
      {label: 'launch', description: 'launch an executable under gdb'},
    ]);
    if (!choice) return;

    if (choice.label === 'attach') {
      throw new Error('TODO(b/227137453): support it');
    }

    // TODO(b/227137453): report progress.

    const targetCands = await this.device.listExecutablesWithDebugSymbols();
    if (targetCands instanceof Error) {
      // TODO(b/227137453): handle it.
      throw targetCands;
    }

    // TODO(b/227137453): show previously selected cadidates first.
    const executablePath = await showInputBoxWithSuggestions(
      targetCands.map(x => ({label: x})),
      {title: 'select the executable to debug'}
    );
    if (!executablePath) return;

    const port = await this.device.ensureSshSession();
    if (!port) {
      // TODO(b/227137453): handle failure.
      return;
    }

    const attrs = await this.device.getAttributes();
    if (attrs instanceof Error) {
      throw new Error('TODO(b/227137453): handle error ' + attrs.message);
    }
    const board = attrs.board;

    const args = makeGdbArgsForLaunch({
      board,
      executablePath,
    });

    const server = await this.gdbShimServerStarter.start(args);
    if (server instanceof Error) {
      throw new Error('TODO(b/227137453): handle error ' + server.message);
    }

    // TODO(b/227137453): Ensure nc exists or implement the equivalent program in python.
    const shellProgram = `#!/bin/bash

nc localhost ${server.port}
`;
    const tempDir = await fs.promises.mkdtemp(
      path.join(this.tempDir, 'chromiumide-remote-debug')
    );
    const gdb = path.join(tempDir, 'gdb.sh');
    await fs.promises.writeFile(gdb, shellProgram, 'utf8');
    await fs.promises.chmod(gdb, 0o755);

    server.onClose(() => fs.rmSync(tempDir, {recursive: true}));

    // TODO(b/227137453): Ensure Native Debug extension is installed.

    // See https://github.com/WebFreak001/code-debug/blob/master/package.json
    // for the meaning of the fields.
    const debugConfiguration: vscode.DebugConfiguration = {
      name: 'Debug ' + executablePath,
      type: 'gdb',
      request: 'attach',
      // Launch gdbserver on DUT from chroot.
      target: `| ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -i /mnt/host/source/chromite/ssh_keys/testing_rsa root@localhost -p ${port} gdbserver - ${executablePath}`,
      remote: true,
      gdbpath: gdb,
      // cwd is not important, but setting it is required.
      cwd: '/',
      // TODO(b/227137453): Remove the following debug options after confirming stability.
      printCalls: true,
      showDevDebugOutput: true,
    };

    const started = await vscode.debug.startDebugging(
      vscode.workspace.workspaceFolders?.[0],
      debugConfiguration
    );
    if (!started) {
      server.close();
      throw new Error(
        'TODO(b/227137453): handle error; failed to start debugging'
      );
    }
  }
}
