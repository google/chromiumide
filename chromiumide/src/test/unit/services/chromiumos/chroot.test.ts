// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as commonUtil from '../../../../common/common_util';
import * as services from '../../../../services';
import * as testing from '../../../testing';
import * as fakes from '../../../testing/fakes';

describe('chroot service exec', () => {
  const tempDir = testing.tempDir();

  const {fakeExec} = testing.installFakeExec();
  fakes.installFakeSudo(fakeExec);

  it('calls cros_sdk if outside chroot', async () => {
    await testing.buildFakeChroot(tempDir.path);

    const source = tempDir.path as commonUtil.Source;
    const cros = services.chromiumos.ChrootService.maybeCreate(source, false)!;

    fakes.installChrootCommandHandler(
      fakeExec,
      source,
      'echo',
      ['1'],
      async () => '1\n'
    );
    const res = (await cros.exec('echo', ['1'], {
      sudoReason: 'to echo',
    })) as commonUtil.ExecResult;
    expect(res.stdout).toBe('1\n');
  });

  it('passes through error from cros_sdk command', async () => {
    await testing.buildFakeChroot(tempDir.path);

    const source = tempDir.path as commonUtil.Source;
    const cros = services.chromiumos.ChrootService.maybeCreate(source, false)!;

    fakes.installChrootCommandHandler(
      fakeExec,
      source,
      'false',
      jasmine.anything(),
      async () => new Error('failed')
    );

    expect(await cros.exec('false', [], {sudoReason: 'to false'})).toEqual(
      new Error('failed')
    );
  });
});

describe('maybeCreate', () => {
  const tempDir = testing.tempDir();

  testing.installVscodeDouble(); // Fake vscode.window.showErrorMessage

  it('returns undefined if chrot does not exist', () => {
    expect(
      services.chromiumos.ChrootService.maybeCreate(tempDir.path, false)
    ).toBeUndefined();
  });
});
