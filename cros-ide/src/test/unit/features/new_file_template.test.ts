// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {TEST_ONLY} from '../../../features/new_file_template';

const {textToInsert} = TEST_ONLY;

describe('New file template', () => {
  it('creates right license file', () => {
    expect(textToInsert('cpp')).toMatch(
      /\/\/ Copyright \d+ The ChromiumOS Authors\n/
    );

    expect(textToInsert('python')).toMatch(
      /# Copyright \d+ The ChromiumOS Authors\n/
    );

    expect(textToInsert('unknown')).toBeUndefined();
  });
});
