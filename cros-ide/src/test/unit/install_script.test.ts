// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as assert from 'assert';
import * as fs from 'fs';
import * as commonUtil from '../../common/common_util';
import * as install from '../../tools/install';
import {exactMatch, FakeExec, lazyHandler, prefixMatch} from '../testing';

describe('Install script', () => {
  it('installs default (latest) version', async () => {
    let tempFile = '';
    let installed = false;
    const fake = new FakeExec().on('gsutil',
        exactMatch(['ls', 'gs://chromeos-velocity/ide/cros-ide'],
            async () => {
              return `gs://chromeos-velocity/ide/cros-ide/cros-ide-0.0.1.vsix
gs://chromeos-velocity/ide/cros-ide/cros-ide-0.0.2.vsix@253d24b6b54fa72d21f622b8f1bb6cc9b6f3d435
`;
            }),
    ).on('gsutil',
        prefixMatch(['cp',
          'gs://chromeos-velocity/ide/cros-ide/cros-ide-0.0.2.vsix@' +
          '253d24b6b54fa72d21f622b8f1bb6cc9b6f3d435'],
        async args => {
          tempFile = args[0];
          return '';
        }),
    ).on('code', lazyHandler(() => exactMatch(['--install-extension', tempFile],
        async () => {
          installed = true;
          return '';
        })),
    );

    const revert = commonUtil.setExecForTesting(fake.exec.bind(fake));
    try {
      await install.install('code');
      assert.deepStrictEqual(installed, true);
      const name = tempFile.split('/').pop();
      assert.deepStrictEqual(name, 'cros-ide-0.0.2.vsix');
    } finally {
      revert();
    }
  });

  it('installs specified version', async () => {
    let tempFile = '';
    let installed = false;
    const fake = new FakeExec().on('gsutil',
        exactMatch(['ls', 'gs://chromeos-velocity/ide/cros-ide'],
            async () => {
              return `gs://chromeos-velocity/ide/cros-ide/cros-ide-0.0.1.vsix
gs://chromeos-velocity/ide/cros-ide/cros-ide-0.0.2.vsix@253d24b6b54fa72d21f622b8f1bb6cc9b6f3d435
`;
            }),
    ).on('gsutil', prefixMatch(['cp', 'gs://chromeos-velocity/ide/cros-ide/cros-ide-0.0.1.vsix'],
        async args => {
          tempFile = args[0];
          return '';
        }),
    ).on('code', lazyHandler(() => exactMatch(
        ['--install-extension', tempFile, '--force'], async () => {
          installed = true;
          return '';
        })),
    );

    const revert = commonUtil.setExecForTesting(fake.exec.bind(fake));
    try {
      await install.install('code', {major: 0, minor: 0, patch: 1});
      assert.deepStrictEqual(installed, true);
      const name = tempFile.split('/').pop();
      assert.deepStrictEqual(name, 'cros-ide-0.0.1.vsix');

      await assert.rejects(install.install('code', {major: 0, minor: 0, patch: 99}));
    } finally {
      revert();
    }
  });
});

describe('Build and publish', async () => {
  interface TestCase {
    name: string,
    isDirty?: boolean,
    headIsNotMerged?: boolean,
    customDiffOutput?: string,
    customFilename?: string,
    wantReject?: boolean,
    wantBuilt?: boolean,
    wantUploaded?: boolean,
  };
  const testCases: TestCase[] = [{
    name: 'succeeds',
    wantBuilt: true,
    wantUploaded: true,
  }, {
    name: 'fails when git status is dirty',
    isDirty: true,
    wantReject: true,
  }, {
    name: 'fails when HEAD is not merged to cros/main',
    headIsNotMerged: true,
    wantReject: true,
  }, {
    name: 'fails when package.json is not updated',
    // eslint-disable-next-line max-len
    customDiffOutput: '',
    wantReject: true,
  }, {
    name: 'fails when version is not updated',
    // eslint-disable-next-line max-len
    customDiffOutput: `diff --git a/ide_tooling/cros-ide/package.json b/ide_tooling/cros-ide/package.json
index 11eef9ccd..0ee259d51 100644
--- a/ide_tooling/cros-ide/package.json
+++ b/ide_tooling/cros-ide/package.json
@@ -115,7 +115,7 @@
           "command": "cros-ide.codeSearchOpenCurrentFile"
         },
         {
-          "command" : "cros-ide.codeSearchSearchForSelection"
+          "command": "cros-ide.codeSearchSearchForSelection"
         }
       ],
       "view/title": [
`,
    wantReject: true,
  }, {
    name: 'fails when generated version is old',
    customFilename: 'cros-ide-0.0.2.vsix',
    wantReject: true,
    wantBuilt: true,
  }];
  testCases.forEach((testCase) => {
    it(testCase.name, async () => {
      const gitHash = 'b9dfaf485e2caf5030199166469ce28e91680255';
      const filename = testCase.customFilename || 'cros-ide-0.0.3.vsix';

      let tempDir = '';
      let built = false;
      let uploaded = false;

      const fake = new FakeExec().on('git', exactMatch(['status', '--short'],
          async () => {
            return testCase.isDirty ? ' M src/tools/install.ts\n' : '';
          }),
      ).on('git', exactMatch(['rev-parse', 'HEAD'], async () => {
        return gitHash;
      })).on('git', exactMatch(
          ['merge-base', '--is-ancestor', 'HEAD', 'cros/main'], async () => {
            if (testCase.headIsNotMerged) {
              throw new Error(`Exit code: 1`);
            }
            return '';
          }),
      ).on('git', exactMatch(['diff', '-p', 'HEAD~', '--', '**package.json'],
          async () => {
            if (testCase.customDiffOutput !== undefined) {
              return testCase.customDiffOutput;
            }
            // eslint-disable-next-line max-len
            return `diff --git a/ide_tooling/cros-ide/package.json b/ide_tooling/cros-ide/package.json
index ee8697e11..877d91ddd 100644
--- a/ide_tooling/cros-ide/package.json
+++ b/ide_tooling/cros-ide/package.json
@@ -2,7 +2,7 @@
   "name": "cros-ide",
   "displayName": "cros-ide",
   "description": "Connect to Chrome OS DUTs over VNC",
-  "version": "0.0.2",
+  "version": "0.0.3",
   "publisher": "cros-velocity",
   "repository": "https://chromium.googlesource.com/chromiumos/chromite/+/HEAD/ide_tooling",
   "engines": {
`;
          }),
      ).on('gsutil', exactMatch(['ls', 'gs://chromeos-velocity/ide/cros-ide'],
          async () => {
            return `gs://chromeos-velocity/ide/cros-ide/cros-ide-0.0.1.vsix
gs://chromeos-velocity/ide/cros-ide/cros-ide-0.0.2.vsix@253d24b6b54fa72d21f622b8f1bb6cc9b6f3d435
`;
          },
      )).on('npx', prefixMatch(['vsce@1.103.1', 'package', '-o'],
          async args => {
            tempDir = args[0];
            await fs.promises.writeFile(`${tempDir}${filename}`, '<fake>');
            built = true;
            return '';
          }),
      ).on('gsutil', lazyHandler(() => exactMatch(
          ['cp', `${tempDir}${filename}`,
            `gs://chromeos-velocity/ide/cros-ide/${filename}@${gitHash}`],
          async () => {
            uploaded = true;
            return '';
          },
      )));

      const revert = commonUtil.setExecForTesting(fake.exec.bind(fake));
      try {
        const result = install.buildAndUpload();
        if (testCase.wantReject) {
          await assert.rejects(result);
        } else {
          await result;
        }
        assert.strictEqual(built, !!testCase.wantBuilt);
        assert.strictEqual(uploaded, !!testCase.wantUploaded);
        if (built) {
          assert.strictEqual(fs.existsSync(tempDir), false);
        }
      } finally {
        revert();
      }
    },
    );
  });

  it('installs dev version', async () => {
    let tempDir = '';
    let built = false;
    let installed = false;
    const fake = new FakeExec().on('npx',
        prefixMatch(['vsce@1.103.1', 'package', '-o'], async args => {
          tempDir = args[0];
          built = true;
          // As old as the latest version in GS.
          await fs.promises.writeFile(
              `${tempDir}cros-ide-0.0.2.vsix`, '<fake>');
          return '';
        }),
    ).on('code', lazyHandler(() => exactMatch(
        ['--force', '--install-extension', `${tempDir}cros-ide-0.0.2.vsix`], async () => {
          installed = true;
          return '';
        }),
    ));

    const revert = commonUtil.setExecForTesting(fake.exec.bind(fake));
    try {
      await install.installDev('code');
      assert.strictEqual(built, true);
      assert.strictEqual(installed, true);
    } finally {
      revert();
    }
  });
});

describe('Argument parser', () => {
  it('recognizes --dev', () => {
    assert.deepStrictEqual(
        install.parseArgs(['--dev']),
        {
          exe: 'code',
          dev: true,
        },
    );
  });
  it('recognizes --upload', () => {
    assert.deepStrictEqual(
        install.parseArgs(['--upload']),
        {
          exe: 'code',
          upload: true,
        },
    );
  });
  it('recognizes --exe', () => {
    assert.deepStrictEqual(
        install.parseArgs(['--exe', '/path/to/code-server']),
        {
          exe: '/path/to/code-server',
        },
    );
  });
  it('recognizes --version', () => {
    assert.deepStrictEqual(
        install.parseArgs(['ts-node', 'install.ts', '--force', '1.2.3']),
        {
          exe: 'code',
          forceVersion: {
            major: 1,
            minor: 2,
            patch: 3,
          },
        },
    );
  });
  it('recognizes --help', () => {
    assert.deepStrictEqual(
        install.parseArgs(['--help']),
        {
          exe: 'code',
          help: true,
        },
    );
  });
  it('throws on invalid input', () => {
    assert.throws(() => install.parseArgs(['--force']));
    assert.throws(() => install.parseArgs(['--force', 'invalid']));
    assert.throws(() => install.parseArgs(['--force', 'v1.2.3']));
    assert.throws(() => install.parseArgs(['--force', '1.2']));
    assert.throws(() => install.parseArgs(['--force', '1.2.3.4']));
    assert.throws(() => install.parseArgs(['--dev', '--upload']));
    assert.throws(() => install.parseArgs(['--upload', '--force', '1.2.3']));
    assert.throws(() => install.parseArgs(['--unknownflag']));
  });
});
