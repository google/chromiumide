// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as assert from 'assert';
import * as fs from 'fs';
import * as install from '../../tools/install';

// Returns fake stdout or undefined if args is not handled.
type Handler = (args: string[]) => Promise<string | undefined>;

function exectMatch(wantArgs: string[],
    handle: () => Promise<string>): Handler {
  return async args => {
    if (wantArgs.length === args.length &&
      wantArgs.every((x, i) => x === args[i])) {
      return await handle();
    }
    return undefined;
  };
}

function prefixMatch(wantPrefix: string[],
    handle: (restArgs: string[]) => Promise<string>): Handler {
  return async args => {
    if (wantPrefix.length <= args.length &&
      wantPrefix.every((x, i) => x === args[i])) {
      return await handle(args.slice(wantPrefix.length));
    }
    return undefined;
  };
}

function lazyHandler(f: () => Handler): Handler {
  return async args => {
    return f()(args);
  };
}

class FakeExec {
  handlers: Map<string, Handler[]> = new Map();
  on(name: string, handle: Handler): FakeExec {
    if (!this.handlers.has(name)) {
      this.handlers.set(name, []);
    }
    this.handlers.get(name)!.push(handle);
    return this;
  }
  async exec(name: string, args: string[],
      _log?: (line: string) => void,
      _opt?: { logStdout?: boolean }): Promise<string> {
    for (const handler of (this.handlers.get(name) || [])) {
      const res = await handler(args);
      if (res !== undefined) {
        return res;
      }
    }
    throw new Error(`${name} ${args.join(' ')}: not handled`);
  }
}

suite('Install script', () => {
  test('Install', async () => {
    let tempFile = '';
    let installed = false;
    const fake = new FakeExec().on('gsutil', exectMatch(['ls', 'gs://chromeos-velocity/ide/cros-ide'],
        async () => {
          return `gs://chromeos-velocity/ide/cros-ide/cros-ide-0.0.1.vsix
gs://chromeos-velocity/ide/cros-ide/cros-ide-0.0.2.vsix@253d24b6b54fa72d21f622b8f1bb6cc9b6f3d435
`;
        }),
    ).on('gsutil', prefixMatch(['cp', 'gs://chromeos-velocity/ide/cros-ide/cros-ide-0.0.2.vsix@253d24b6b54fa72d21f622b8f1bb6cc9b6f3d435'],
        async args => {
          tempFile = args[0];
          return '';
        }),
    ).on('code', lazyHandler(() => exectMatch(['--install-extension', tempFile],
        async () => {
          installed = true;
          return '';
        })),
    );

    const revert = install.setExecForTesting(fake.exec.bind(fake));
    try {
      await install.install();
      assert.deepStrictEqual(installed, true);
      const name = tempFile.split('/').pop();
      assert.deepStrictEqual(name, 'cros-ide-0.0.2.vsix');
    } finally {
      revert();
    }
  });

  test('Build and upload', async () => {
    const gitHash = 'b9dfaf485e2caf5030199166469ce28e91680255';
    let tempDir = '';
    let built = false;
    let uploaded = false;
    const fake = new FakeExec().on('git', exectMatch(['diff', '--stat'],
        async () => {
          return ''; // not dirty
        }),
    ).on('git', exectMatch(['rev-parse', 'cros/main'], async () => {
      return gitHash;
    })).on('git', exectMatch(['rev-parse', 'HEAD'], async () => {
      return gitHash;
    })).on('npx', prefixMatch(['vsce@1.103.1', 'package', '-o'], async args => {
      tempDir = args[0];
      await fs.promises.writeFile(`${tempDir}cros-ide-0.0.3.vsix`, '<fake>');
      built = true;
      return '';
    })).on('gsutil', exectMatch(['ls', 'gs://chromeos-velocity/ide/cros-ide'],
        async () => {
          return `gs://chromeos-velocity/ide/cros-ide/cros-ide-0.0.1.vsix
gs://chromeos-velocity/ide/cros-ide/cros-ide-0.0.2.vsix@253d24b6b54fa72d21f622b8f1bb6cc9b6f3d435
`;
        }),
    ).on('gsutil', lazyHandler(() => exectMatch(['cp', `${tempDir}cros-ide-0.0.3.vsix`, `gs://chromeos-velocity/ide/cros-ide/cros-ide-0.0.3.vsix@${gitHash}`],
        async () => {
          uploaded = true;
          return '';
        }),
    ));

    const revert = install.setExecForTesting(fake.exec.bind(fake));
    try {
      await install.buildAndUpload();
      assert.strictEqual(built, true);
      assert.strictEqual(uploaded, true);
      assert.strictEqual(fs.existsSync(tempDir), false);
    } finally {
      revert();
    }
  });

  test('Build and upload fails on old version', async () => {
    const gitHash = 'b9dfaf485e2caf5030199166469ce28e91680255';
    let tempDir = '';
    let built = false;
    const fake = new FakeExec().on('git', exectMatch(['diff', '--stat'],
        async () => {
          return '';
        }),
    ).on('git', exectMatch(['rev-parse', 'cros/main'], async () => {
      return gitHash;
    })).on('git', exectMatch(['rev-parse', 'HEAD'], async () => {
      return gitHash;
    })).on('gsutil', exectMatch(['ls', 'gs://chromeos-velocity/ide/cros-ide'],
        async () => {
          return `gs://chromeos-velocity/ide/cros-ide/cros-ide-0.0.1.vsix
gs://chromeos-velocity/ide/cros-ide/cros-ide-0.0.2.vsix@253d24b6b54fa72d21f622b8f1bb6cc9b6f3d435
`;
        }),
    ).on('npx', prefixMatch(['vsce@1.103.1', 'package', '-o'], async args => {
      tempDir = args[0];
      built = true;
      // As old as the latest version in GS.
      await fs.promises.writeFile(`${tempDir}cros-ide-0.0.2.vsix`, '<fake>');
      return '';
    }));

    const revert = install.setExecForTesting(fake.exec.bind(fake));
    try {
      await assert.rejects(install.buildAndUpload());
      assert.strictEqual(built, true);
      assert.strictEqual(fs.existsSync(tempDir), false);
    } finally {
      revert();
    }
  });
});
