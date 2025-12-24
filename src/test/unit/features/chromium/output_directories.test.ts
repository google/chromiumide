// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs/promises';
import mockFs = require('mock-fs');
import {createOrUpdateSymLinkToDirectory} from '../../../../features/chromium/output_directories';

describe('createOrUpdateSymLinkToDirectory', () => {
  afterEach(() => {
    mockFs.restore();
  });

  it('can create new symlink', async () => {
    mockFs({
      '/target-directory': {},
    });
    expect(
      await createOrUpdateSymLinkToDirectory('/target-directory', '/link')
    ).toBeTrue();
    expect(await fs.readlink('/link')).toBe('/target-directory');
  });

  it('can update existing symlink', async () => {
    mockFs({
      '/target-directory': {},
      '/link': mockFs.symlink({path: '/foo'}),
    });
    expect(
      await createOrUpdateSymLinkToDirectory('/target-directory', '/link')
    ).toBeTrue();
    expect(await fs.readlink('/link')).toBe('/target-directory');
  });

  it('errors when the target is not a symbolic link', async () => {
    mockFs({
      '/target-directory': {},
      '/link': mockFs.file({content: 'test'}),
    });
    expect(
      await createOrUpdateSymLinkToDirectory('/target-directory', '/link')
    ).toBeFalse();
    expect(await fs.readFile('/link', 'utf-8')).toBe('test');
  });
});
