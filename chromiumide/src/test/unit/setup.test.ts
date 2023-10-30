// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import 'jasmine';
import * as fs from 'fs';
import * as commonUtil from '../../common/common_util';

const WANT_NODE_VERSION = /v16\..*/;

describe('Dev environment', () => {
  it('uses proper node version following go/chromiumide-dev-guide', async () => {
    const version = await commonUtil.execOrThrow('node', ['--version']);
    expect(version.stdout).toMatch(WANT_NODE_VERSION);
  });

  it('should not use a symlinked directory: http://b/290870272', async () => {
    const cwd = process.env.PWD as string;

    const realpath = await fs.promises.realpath(cwd);

    expect(cwd).toEqual(realpath);
  });
});
