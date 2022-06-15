// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as path from 'path';
import {ExecResult, Source} from '../../../common/common_util';
import {WrapFs} from '../../../common/cros';
import {ChrootService} from '../../../services/chroot';
import {exactMatch, installFakeExec, tempDir} from '../../testing';
import {installFakeSudo} from '../../testing/fakes';

describe('chroot service', () => {
  const temp = tempDir();

  const {fakeExec} = installFakeExec();
  installFakeSudo(fakeExec);

  it('exec passes through if inside chroot', async () => {
    const cros = new ChrootService(
      undefined,
      new WrapFs(temp.path as Source),
      /* isInsideChroot = */ () => true
    );

    fakeExec.on(
      'echo',
      exactMatch(['1'], async () => '1\n')
    );
    const res = (await cros.exec('echo', ['1'], {
      sudoReason: '',
    })) as ExecResult;
    expect(res.stdout).toBe('1\n');
  });

  it('exec calls cros_sdk if outside chroot', async () => {
    const source = temp.path as Source;
    const cros = new ChrootService(
      undefined,
      new WrapFs(source),
      /* isInsideChroot = */ () => false
    );

    fakeExec.on(
      path.join(source, 'chromite/bin/cros_sdk'),
      exactMatch(['--', 'echo', '1'], async () => '1\n')
    );
    const res = (await cros.exec('echo', ['1'], {
      sudoReason: '',
    })) as ExecResult;
    expect(res.stdout).toBe('1\n');
  });

  it('exec passes through error from cros_sdk command', async () => {
    const source = temp.path as Source;
    const cros = new ChrootService(
      undefined,
      new WrapFs(source),
      /* isInsideChroot = */ () => false
    );

    fakeExec.on(
      path.join(source, 'chromite/bin/cros_sdk'),
      exactMatch(['--', 'false'], async () => new Error('failed'))
    );

    expect(await cros.exec('false', [], {sudoReason: ''})).toEqual(
      new Error('failed')
    );
  });
});
