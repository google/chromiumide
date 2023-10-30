// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import 'jasmine';
import * as cipd from '../../../common/cipd';
import * as config from '../../../services/config';
import * as testing from '../../testing';
import * as fakes from '../../testing/fakes';

describe('CIPD repository', () => {
  const {fakeExec} = testing.installFakeExec();
  const cipdRepository = fakes.installFakeCipd(fakeExec);

  it('downloads crosfleet', async () => {
    const path = await cipdRepository.ensureCrosfleet(
      new fakes.VoidOutputChannel()
    );
    expect(path.startsWith(cipdRepository.installDir)).toBeTrue();
  });
});

describe('CIPD repository', () => {
  const {fakeExec} = testing.installFakeExec();

  it('returns an error on failing to run CLI', async () => {
    fakeExec.installCallback(
      'cipd',
      jasmine.anything(),
      async () => new Error('failed to run cipd')
    );

    const cipdRepository = new cipd.CipdRepository();
    await expectAsync(
      cipdRepository.ensureCrosfleet(new fakes.VoidOutputChannel())
    ).toBeRejected();
  });

  it('adjusts PATH based on settings', async () => {
    await config.paths.depotTools.update('/opt/custom_depot_tools');

    let capturedPath: string | undefined = '';
    fakeExec.installCallback(
      'cipd',
      jasmine.anything(),
      async (_name, _args, options) => {
        capturedPath = options?.env?.PATH;
        return 'ok';
      }
    );
    const cipdRepository = new cipd.CipdRepository();

    await expectAsync(
      cipdRepository.ensureCrosfleet(new fakes.VoidOutputChannel())
    ).toBeResolved();

    expect(capturedPath).toEqual(
      jasmine.stringMatching('^/opt/custom_depot_tools:.*/depot_tools')
    );
  });
});
