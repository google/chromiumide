// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as path from 'path';
import {getChromiumosDirectory} from './fs';

describe('getChromiumosDirectory', () => {
  it('returns the chromiumos directory', () => {
    const chromiumos = getChromiumosDirectory();

    const ide = path.join(chromiumos, 'infra/ide');

    expect(fs.existsSync(ide)).toBeTrue();
  });
});
