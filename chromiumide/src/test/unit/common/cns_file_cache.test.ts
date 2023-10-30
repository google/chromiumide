// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as path from 'path';
import mockFs from 'mock-fs';
import * as testing from '../../testing';
import {CnsFileCache} from './../../../common/cns_file_cache';
import {VoidOutputChannel} from './../../testing/fakes/output_channel';

describe('CnsFileCache', () => {
  const FAKE_CACHE_DIR = '/cache';
  const FAKE_CNS_FILE = '/cns/el-d/home/bla/file1';
  const FAKE_CACHED_FILE = path.join(FAKE_CACHE_DIR, FAKE_CNS_FILE);

  describe('getCachedFile', () => {
    const {fakeExec} = testing.installFakeExec();

    beforeEach(() => {
      jasmine.clock().install();
    });

    afterEach(() => {
      mockFs.restore();
      jasmine.clock().uninstall();
    });

    it('does not re-download the file when it is already cached recently enough', async () => {
      mockFs({
        [FAKE_CACHED_FILE]: mockFs.file({
          content: 'content1',
          mtime: new Date(10000),
        }),
      });
      const cache = new CnsFileCache(new VoidOutputChannel(), FAKE_CACHE_DIR);
      jasmine.clock().mockDate(new Date(19999));

      const result = await cache.getCachedFile(FAKE_CNS_FILE, {seconds: 10});

      expect(result).toEqual(FAKE_CACHED_FILE);
      expect(fakeExec).not.toHaveBeenCalled();
    });

    it('re-downloads the file when it is already cached but time to refresh', async () => {
      mockFs({
        [FAKE_CACHED_FILE]: mockFs.file({
          content: 'content1',
          mtime: new Date(10000),
        }),
      });
      const cache = new CnsFileCache(new VoidOutputChannel(), FAKE_CACHE_DIR);
      jasmine.clock().mockDate(new Date(20001));

      fakeExec.installStdout('fileutil', jasmine.anything(), '');

      const result = await cache.getCachedFile(FAKE_CNS_FILE, {seconds: 10});

      expect(result).toEqual(FAKE_CACHED_FILE);
      expect(fakeExec).toHaveBeenCalledOnceWith(
        'fileutil',
        ['cp', '-f', FAKE_CNS_FILE, FAKE_CACHED_FILE],
        jasmine.any(Object)
      );
    });

    it('downloads the file when it is not cached yet', async () => {
      mockFs({
        [FAKE_CACHE_DIR]: {},
      });
      const cache = new CnsFileCache(undefined, FAKE_CACHE_DIR);

      fakeExec.installStdout('fileutil', jasmine.anything(), '');

      const result = await cache.getCachedFile(FAKE_CNS_FILE, {seconds: 10});

      expect(result).toEqual(FAKE_CACHED_FILE);
      expect(fakeExec).toHaveBeenCalledOnceWith(
        'fileutil',
        ['cp', '-f', FAKE_CNS_FILE, FAKE_CACHED_FILE],
        jasmine.any(Object)
      );
    });
  });
});
