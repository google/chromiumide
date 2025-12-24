// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {AbnormalExitError} from '../../../../shared/app/common/exec/types';
import {FakeExec} from '../fake_exec';

/**
 * Installs a fake depot tools for testing, and returns a FakeDepotTools
 * that you can use to set its behavior.
 *
 * This function should be called in describe. Returned FakeDepotTools is
 * reset between tests.
 */
export function installFakeDepotTools(
  fakeExec: FakeExec,
  findCros = true
): void {
  beforeEach(() => {
    fakeExec
      .withArgs('which', ['cros'], jasmine.anything())
      .and.callFake(async () => {
        if (!findCros) {
          return new AbnormalExitError('which', ['cros'], 1, '', '');
        }
        return {
          exitStatus: 0,
          stdout: '/path/to/depot_tools/cros',
          stderr: '',
        };
      });
  });
}
