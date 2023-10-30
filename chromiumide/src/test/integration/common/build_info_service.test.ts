// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as os from 'os';
import {CnsFileCache} from '../../../common/cns_file_cache';
import {BuildInfoService} from '../../../features/device_management/builds/build_info_service';
import {VoidOutputChannel} from './../../testing/fakes/output_channel';

describe('BuildInfoService', () => {
  const cacheDir = fs.mkdtempSync(os.tmpdir() + '/');

  afterAll(async () => {
    await fs.promises.rmdir(cacheDir, {recursive: true});
  });

  xdescribe('loadRawBuildInfos', () => {
    it('downloads and loads the builds list', async () => {
      const service = new BuildInfoService(
        new CnsFileCache(new VoidOutputChannel(), cacheDir)
      );

      const result = await service.loadRawBuildInfos();

      expect(result.length).toBeGreaterThan(100);
      expect(result[0].buildDate).toBeInstanceOf(Date);
    }, 30e3);
  });

  xdescribe('loadBuildInfos', () => {
    it("returns each board's build, mostly distinct on signedBuildId and timestamp", async () => {
      const service = new BuildInfoService(
        new CnsFileCache(new VoidOutputChannel(), cacheDir)
      );

      const result = await service.loadBuildInfos('');

      // TODO(b/262300937): Remove once the duplicates are resolved with the correct data source.
      result
        .filter(
          (info, i) =>
            i > 0 &&
            result[i - 1].signedBuildId === info.signedBuildId &&
            result[i - 1].buildDate.getTime() === info.buildDate.getTime()
        )
        .forEach((info, i) =>
          console.log(
            `\n${JSON.stringify(result[i - 1])}\n${JSON.stringify(info)}`
          )
        );

      const distinct = new Set(
        result.map(
          info =>
            info.signedBuildId + ' ' + info.buildDate.getTime() + info.boardName
        )
      );
      expect(distinct.size / result.length).toBeGreaterThan(0.99); // 99% unique
    }, 30e3);

    it('returns each distinct build for the given board only', async () => {
      const service = new BuildInfoService(
        new CnsFileCache(new VoidOutputChannel(), cacheDir)
      );

      const result = await service.loadBuildInfos('octopus');

      expect(new Set(result.map(info => info.boardName)).size).toBe(1);
      expect(result[0].boardName).toBe('octopus');
      result.forEach(info => console.log(JSON.stringify(info)));

      const distinct = new Set(
        result.map(info => info.signedBuildId + info.buildDate.getTime())
      );
      expect(result.length).toBe(distinct.size);
    }, 30e3);
  });
});
