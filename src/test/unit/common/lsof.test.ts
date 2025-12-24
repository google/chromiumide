// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {Lsof} from '../../../common/lsof';
import * as testing from '../../testing';

describe('Lsof', () => {
  const fakeExec = testing.installFakeExec();

  it('parses single output', async () => {
    fakeExec.installStdout(
      'lsof',
      ['-i', 'tcp:3000', '-s', 'tcp:listen', '-F', 'cp'],
      `p3353351
ccode-tunnel
`
    );

    expect(
      await new Lsof().i('tcp:3000').s('tcp:listen').bigF('cp').run()
    ).toEqual([
      {
        p: '3353351',
        c: 'code-tunnel',
      },
    ]);
  });

  it('parses multiple output', async () => {
    fakeExec.installStdout(
      'lsof',
      ['-i', 'tcp', '-F', 'c'],
      // Lsof  always  produces one field, the PID (`p') field.
      `p6047
cnode
p8555
cchrome-remote-d
p3353351
ccode-tunnel
`
    );

    expect(await new Lsof().i('tcp').bigF('c').run()).toEqual([
      {
        p: '6047',
        c: 'node',
      },
      {
        p: '8555',
        c: 'chrome-remote-d',
      },
      {
        p: '3353351',
        c: 'code-tunnel',
      },
    ]);
  });
});
