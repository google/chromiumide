// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as dateFns from 'date-fns';
import {CnsFileCache} from '../../../common/cns_file_cache';
import * as model from './build_model';

const BUILDS_INFO_CNS_PATH =
  '/cns/el-d/home/chromeos/builds/chromeos-builds.json';
const REFRESH_FREQUENCY: dateFns.Duration = {hours: 6};

/**
 * Retrieves information on all internal ChromeOS builds.
 *
 * The current implementation pulls from a file on CNS (exported by a Plx workflow), caching the
 * file locally for quicker retrieval the next time (using CnsFileCache). The CNS file is exported
 * from a Plx workflow and script, from tables exported by Goldeneye.
 *
 * Plx Workflow: https://plx.corp.google.com/pipelines/workflow/_4bd0e237_1120_49ee_94c2_3f0d64e0776b?m=view
 * Plx Script: https://plx.corp.google.com/scripts2/script_62._35ce08_0000_24e7_81c7_3c286d4ed30a
 *
 * TODO(b/262560183): Add Plx workflow and script to code base and git VCS, with
 * deployment script.
 */
export class BuildInfoService {
  constructor(private cnsFileCache: CnsFileCache) {}

  /** Loads the build info data, which may contain duplicates.
   *
   * TODO(b/262300937): Revisit the duplicates issue once the correct data source is used.
   */
  async loadRawBuildInfos(): Promise<model.PrebuildInfo[]> {
    const path = await this.cnsFileCache.getCachedFile(
      BUILDS_INFO_CNS_PATH,
      REFRESH_FREQUENCY
    );
    const contents: string = (await fs.promises.readFile(path)).toString();
    const builds = contents
      .split(/\r?\n/)
      .filter(line => line.length > 0)
      .map(model.parseBuildInfoFromJson);
    // Note: the Plx script pre-sorts the builds in descending chronological order
    return builds;
  }

  /** Loads info on all builds for the given board, or for all boards if no board provided.
   *
   * @param board Board for which to load builds, or '' to load all builds.
   *
   * TODO(b/262300937): Revisit the duplicates issue once the correct data source is used.
   */
  async loadBuildInfos(board: string | ''): Promise<model.PrebuildInfo[]> {
    const infos = await this.loadRawBuildInfos();
    if (board) {
      return infos.filter(info => info.boardName.startsWith(board));
    } else {
      const distinctSorted = infos.filter(
        (info, i) =>
          i === 0 ||
          (infos[i - 1].signedBuildId !== info.signedBuildId &&
            infos[i - 1].buildDate.getTime() !== info.buildDate.getTime())
      );
      return distinctSorted;
    }
  }
}
