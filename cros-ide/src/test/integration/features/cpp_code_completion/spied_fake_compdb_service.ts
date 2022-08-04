// Copyright 2022 The ChromiumOS Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as path from 'path';
import * as commonUtil from '../../../../common/common_util';
import * as compdbService from '../../../../features/cpp_code_completion/compdb_service';
import {PackageInfo} from '../../../../features/cpp_code_completion/packages';

export class SpiedFakeCompdbService implements compdbService.CompdbService {
  readonly requests: Array<{board: string; packageInfo: PackageInfo}> = [];

  constructor(private readonly source: commonUtil.Source) {}

  async generate(board: string, packageInfo: PackageInfo) {
    const dest = compdbService.destination(this.source, packageInfo);
    await fs.promises.mkdir(path.dirname(dest), {recursive: true});
    await fs.promises.writeFile(dest, 'fake compdb');

    this.requests.push({board, packageInfo});
  }

  isEnabled(): boolean {
    return true;
  }
}
