// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as path from 'path';
import {BoardOrHost} from '../../../../../shared/app/common/board_or_host';
import * as commonUtil from '../../../../../shared/app/common/common_util';
import * as compdbService from '../../../../features/chromiumos/cpp_xrefs/compdb_service';
import {PackageInfo} from '../../../../services/chromiumos';

export class SpiedFakeCompdbService implements compdbService.CompdbService {
  readonly requests: Array<{board: string; packageInfo: PackageInfo}> = [];

  constructor(private readonly source: commonUtil.Source) {}

  async generate(board: BoardOrHost, packageInfo: PackageInfo): Promise<void> {
    const dest = compdbService.destination(this.source, packageInfo);
    await fs.promises.mkdir(path.dirname(dest), {recursive: true});
    await fs.promises.writeFile(dest, 'fake compdb');

    this.requests.push({board: board.toString(), packageInfo});
  }

  isEnabled(): boolean {
    return true;
  }
}
