// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {CompatibilityChecker} from '../../../../../../features/device_management/commands/check_image/compatibility';
import {CONFIG, getTestingInput} from './common';

describe('check image compatibility when', () => {
  it('failed to get use flags', () => {
    const output = new CompatibilityChecker(
      CONFIG,
      getTestingInput(
        'release',
        2,
        new Error('fake error failed to get USE flags'),
        1
      )
    ).check();

    expect(output.passed).toBeFalse();
    expect(output.results.debugFlag.status).toEqual('ERROR');
  });

  it('failed to get local prebuilt versions', () => {
    const output = new CompatibilityChecker(
      CONFIG,
      getTestingInput(
        'release',
        2,
        undefined,
        new Error('fake error failed to get local prebuilt versions')
      )
    ).check();

    expect(output.passed).toBeFalse();
    expect(output.results.version.status).toEqual('ERROR');
  });

  it('image should be non-debug but not', () => {
    const output = new CompatibilityChecker(
      CONFIG,
      getTestingInput('postsubmit', 2, false, 1)
    ).check();

    expect(output.passed).toBeFalse();
    expect(output.results.debugFlag.status).toEqual('FAILED');
  });

  it('image should be debug but not', () => {
    const output = new CompatibilityChecker(
      CONFIG,
      getTestingInput('release', 2, true, 1)
    ).check();

    expect(output.passed).toBeFalse();
    expect(output.results.debugFlag.status).toEqual('FAILED');
  });

  it('image too old', () => {
    const output = new CompatibilityChecker(
      CONFIG,
      getTestingInput('release', 2, undefined, 10)
    ).check();

    expect(output.passed).toBeFalse();
    expect(output.results.version.status).toEqual('FAILED');
  });

  it('image too new', () => {
    const output = new CompatibilityChecker(
      CONFIG,
      getTestingInput('release', 20, undefined, 1)
    ).check();

    expect(output.passed).toBeFalse();
    expect(output.results.version.status).toEqual('FAILED');
  });

  it('image is compatible', () => {
    const output = new CompatibilityChecker(
      CONFIG,
      getTestingInput('release', 2, undefined, 1)
    ).check();

    expect(output.passed).toBeTrue();
    expect(output.results.debugFlag.status).toEqual('PASSED');
    expect(output.results.version.status).toEqual('PASSED');
  });
});
