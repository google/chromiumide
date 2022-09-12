// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import 'jasmine';
import * as cipd from '../../../common/cipd';
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
    fakeExec.on('cipd', async () => new Error('failed to run cipd'));

    const cipdRepository = new cipd.CipdRepository();
    await expectAsync(
      cipdRepository.ensureCrosfleet(new fakes.VoidOutputChannel())
    ).toBeRejected();
  });
});
