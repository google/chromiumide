// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as path from 'path';
import * as fs from '../../../../common/chromium/fs';
import * as testing from '../../../testing';

const GCLIENT_CONTENT = `solutions = [
  {
    "name": "src",
    "url": "https://chromium.googlesource.com/chromium/src.git",
    "managed": False,
    "custom_deps": {},
    "custom_vars": {},
  },
]
`;

describe('Chromium fs identifies chromium root', () => {
  const tempDir = testing.tempDir();

  it('from file directory with regular .gclient', async () => {
    await testing.putFiles(tempDir.path, {'.gclient': GCLIENT_CONTENT});

    expect(await fs.chromiumRoot(tempDir.path)).toBe(tempDir.path);
  });

  it('from file directory with unicoded .gclient', async () => {
    const unicoded_gclient_content = `solutions = [
  {
    "name": "src",
    u"url": u"https://chromium.googlesource.com/chromium/src.git",
    "managed": False,
    "custom_deps": {},
    "custom_vars": {},
  },
]
`;
    await testing.putFiles(tempDir.path, {
      '.gclient': unicoded_gclient_content,
    });

    expect(await fs.chromiumRoot(tempDir.path)).toBe(tempDir.path);
  });

  it('from file in subdirectory', async () => {
    await testing.putFiles(tempDir.path, {
      '.gclient': GCLIENT_CONTENT,
      'foo/bar/baz.cc': '',
    });

    expect(
      await fs.chromiumRoot(path.join(tempDir.path, 'foo', 'bar', 'baz.cc'))
    ).toBe(tempDir.path);
  });
});
