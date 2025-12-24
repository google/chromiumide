// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {CommandContext} from '../../../../../features/device_management/commands/common';
import {Device} from '../../../../../features/device_management/commands/remote_debug/device';
import * as testing from '../../../../testing';
import {FakeSshServer} from '../fake_ssh_server';

describe('Device', () => {
  const origPath = process.env.PATH;
  const tempDir = testing.tempDir();
  const subscriptions: vscode.Disposable[] = [];

  beforeEach(async () => {
    const fakeScanelfProgram = `#!/bin/bash

if [[ "$*" != "-BF %F" ]]; then
    echo "unexpcted args $*" 1>&2
    exit 1
fi
while read f; do
    magic="$(head -c4 $f)"
    if [[ "\${magic:1:3}" == ELF ]]; then
        echo $f
    fi
done
`;
    await testing.putFiles(tempDir.path, {'bin/scanelf': fakeScanelfProgram});

    const fakeScanelf = path.join(tempDir.path, 'bin/scanelf');
    await fs.promises.chmod(fakeScanelf, 0o755);

    process.env.PATH += ':' + path.dirname(fakeScanelf);
  });

  afterEach(() => {
    vscode.Disposable.from(...subscriptions.splice(0).reverse()).dispose();
    process.env.PATH = origPath;
  });

  it('lists executables with debug symbols', async () => {
    // Prepare a fake device.
    const sshServer = new FakeSshServer({execRealCommand: true});
    subscriptions.push(sshServer);
    await sshServer.listen();
    const port = sshServer.listenPort;
    const hostname = `localhost:${port}`;

    const dutRoot = path.join(tempDir.path, 'dut');

    await testing.putFiles(dutRoot, {
      '/usr/bin/codelab': '',
      '/usr/bin/fake': '', // a fake file that doesn't exists in reality
      '/var/db/pkg/chromeos-base/codelab-9999/DEBUGBUILD': '',
      '/var/db/pkg/chromeos-base/codelab-9999/FEATURES': 'nostrip',
      '/var/db/pkg/chromeos-base/codelab-9999/CONTENTS': `dir /usr
dir /usr/bin
obj /usr/bin/codelab <fake> <fake>
obj /usr/bin/fake <fake> <fake>
`,
    });
    // Copy an ELF binary as a fake codelab file. Do nothing for /usr/bin/fake so it's filtered out.
    await fs.promises.copyFile('/bin/bash', dutRoot + '/usr/bin/codelab');

    const device = new Device(
      {
        sshIdentity: sshServer.sshIdentity,
      } as CommandContext,
      hostname,
      dutRoot
    );

    const executables = await device.listExecutablesWithDebugSymbols();

    expect(executables).toEqual([dutRoot + '/usr/bin/codelab']);
  });
});
