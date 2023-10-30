// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs/promises';
import * as path from 'path';
import {CancellationTokenSource} from 'vscode';
import * as gnArgs from '../../../../features/chromium/gn_args';
import * as config from '../../../../services/config';
import * as testing from '../../../testing';

describe('gn args', () => {
  const tempDir = testing.tempDir();
  const {fakeExec} = testing.installFakeExec();

  beforeEach(async () => {
    await config.paths.depotTools.update('/opt/custom_depot_tools');
  });

  for (const testCase of [
    {
      name: 'shows warning if neither goma or siso is enabled',
      gnArgs: [{name: 'foo_bar', current: {value: 'true'}}],
      wantWarnings: [
        jasmine.stringContaining('Neither Goma, Siso, nor Reclient is enabled'),
      ],
      wantArgs: {
        use_siso: false,
        use_goma: false,
        use_remoteexec: false,
      },
    },
    {
      name: 'shows warning if goma is explicitly disabled',
      gnArgs: [{name: 'use_goma', current: {value: 'false'}}],
      wantWarnings: [
        jasmine.stringContaining('Neither Goma, Siso, nor Reclient is enabled'),
      ],
      wantArgs: {
        use_siso: false,
        use_goma: false,
        use_remoteexec: false,
      },
    },
    {
      name: 'shows warning if siso is explicitly disabled',
      gnArgs: [{name: 'use_siso', current: {value: 'false'}}],
      wantWarnings: [
        jasmine.stringContaining('Neither Goma, Siso, nor Reclient is enabled'),
      ],
      wantArgs: {
        use_siso: false,
        use_goma: false,
        use_remoteexec: false,
      },
    },
    {
      name: 'shows no warning if goma is enabled',
      gnArgs: [{name: 'use_goma', current: {value: 'true'}}],
      wantWarnings: [],
      wantArgs: {
        use_siso: false,
        use_goma: true,
        use_remoteexec: false,
      },
    },
    {
      name: 'shows no warning if siso is enabled',
      gnArgs: [{name: 'use_siso', current: {value: 'true'}}],
      wantWarnings: [],
      wantArgs: {
        use_siso: true,
        use_goma: false,
        use_remoteexec: false,
      },
    },
    {
      name: 'shows no warning if reclient is enabled',
      gnArgs: [{name: 'use_remoteexec', current: {value: 'true'}}],
      wantWarnings: [],
      wantArgs: {
        use_siso: false,
        use_goma: false,
        use_remoteexec: true,
      },
    },
  ]) {
    it(`queries GN args correctly and ${testCase.name}`, async () => {
      await fs.mkdir(path.join(tempDir.path, 'out'));
      await fs.mkdir(path.join(tempDir.path, 'out/dir1'));

      fakeExec.installStdout(
        'gn',
        [
          'args',
          path.join(tempDir.path, 'out', 'dir1'),
          '--list',
          '--short',
          '--overrides-only',
          '--json',
        ],
        JSON.stringify(testCase.gnArgs),
        jasmine.objectContaining({cwd: tempDir.path})
      );

      const tokenSource = new CancellationTokenSource();
      const args = await gnArgs.readGnArgs(
        tempDir.path,
        'out/dir1',
        tokenSource.token
      );
      expect(args).toEqual({
        type: 'success',
        warnings: testCase.wantWarnings,
        args: testCase.wantArgs,
      });
    });
  }

  const STDOUT_WITH_WARNING = `\
WARNING at //build/toolchain/cros/BUILD.gn:237:44: Build argument has no effect.
    toolchain_args.needs_gomacc_path_arg = false
                                           ^----
The variable "needs_gomacc_path_arg" was set as a build argument
but never appeared in a declare_args() block in any buildfile.

To view all possible args, run "gn args --list <out_dir>"

The build continued as if that argument was unspecified.

[ {
   "current": {
      "value": "true"
   },
   "name": "use_siso"
} ]`;

  it('can parse output if JSON is preceded by a warning', async () => {
    fakeExec.installStdout(
      'gn',
      [
        'args',
        path.join(tempDir.path, 'out', 'dir1'),
        '--list',
        '--short',
        '--overrides-only',
        '--json',
      ],
      STDOUT_WITH_WARNING,
      jasmine.objectContaining({cwd: tempDir.path})
    );

    const tokenSource = new CancellationTokenSource();
    const args = await gnArgs.readGnArgs(
      tempDir.path,
      'out/dir1',
      tokenSource.token
    );
    expect(args).toEqual({
      type: 'success',
      warnings: [
        jasmine.stringMatching(/^WARNING at [/][/]build.*was unspecified[.]$/s),
      ],
      args: {use_goma: false, use_remoteexec: false, use_siso: true},
    });
  });

  it('fails to parse invalid JSON', async () => {
    fakeExec.installStdout(
      'gn',
      [
        'args',
        path.join(tempDir.path, 'out', 'dir1'),
        '--list',
        '--short',
        '--overrides-only',
        '--json',
      ],
      'not actually json',
      jasmine.objectContaining({cwd: tempDir.path})
    );

    const tokenSource = new CancellationTokenSource();
    const args = await gnArgs.readGnArgs(
      tempDir.path,
      'out/dir1',
      tokenSource.token
    );
    expect(args).toEqual({
      type: 'error',
      error: jasmine.stringContaining('Unable to parse JSON output'),
    });
  });

  it('fails to parse invalid JSON even if it has `[`', async () => {
    fakeExec.installStdout(
      'gn',
      [
        'args',
        path.join(tempDir.path, 'out', 'dir1'),
        '--list',
        '--short',
        '--overrides-only',
        '--json',
      ],
      'not actually json [ "it looks like json starts here, but this is a lie and still invalid"',
      jasmine.objectContaining({cwd: tempDir.path})
    );

    const tokenSource = new CancellationTokenSource();
    const args = await gnArgs.readGnArgs(
      tempDir.path,
      'out/dir1',
      tokenSource.token
    );
    expect(args).toEqual({
      type: 'error',
      error: jasmine.stringContaining('Unable to parse JSON output'),
    });
  });
});
