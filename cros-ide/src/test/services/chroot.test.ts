// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as assert from 'assert';
import * as path from 'path';
import {ExecResult, Source} from '../../common/common_util';
import {WrapFs} from '../../common/cros';
import {ChrootService} from '../../services/chroot';
import {exactMatch, installFakeExec, tempDir} from '../testing';
import {installVscodeDouble} from '../doubles';

describe('cros service', () => {
  const temp = tempDir();

  const {fakeExec} = installFakeExec();
  const {vscodeSpy} = installVscodeDouble();

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
    const res = (await cros.exec('echo', ['1'])) as ExecResult;
    assert.strictEqual(res.stdout, '1\n');
  });

  it('exec calls cros_sdk if outside chroot', async () => {
    const source = temp.path as Source;
    const cros = new ChrootService(
      undefined,
      new WrapFs(source),
      /* isInsideChroot = */ () => false
    );

    fakeExec
      .on(
        'sudo',
        exactMatch(['true'], async () => '')
      )
      .on(
        'sudo',
        exactMatch(
          [path.join(source, 'chromite/bin/cros_sdk'), '--', 'echo', '1'],
          async () => '1\n'
        )
      );
    const res = (await cros.exec('echo', ['1'])) as ExecResult;
    assert.strictEqual(res.stdout, '1\n');
  });

  it('exec asks sudo password if needed', async () => {
    const source = temp.path as Source;
    const cros = new ChrootService(
      undefined,
      new WrapFs(source),
      /* isInsideChroot = */ () => false
    );

    fakeExec
      .on(
        'sudo',
        exactMatch(['true'], async () => new Error('permission denied'))
      )
      .on(
        'sudo',
        exactMatch(
          ['-S', path.join(source, 'chromite/bin/cros_sdk'), '--', 'echo', '1'],
          async opt => {
            assert.strictEqual(opt?.pipeStdin, 'password');
            return '1\n';
          }
        )
      );

    vscodeSpy.window.showInputBox.and.returnValue(Promise.resolve('password'));

    const res = (await cros.exec('echo', ['1'])) as ExecResult;
    assert.strictEqual(res.stdout, '1\n');
  });
});
