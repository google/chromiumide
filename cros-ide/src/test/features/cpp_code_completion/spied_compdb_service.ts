// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {CompdbService} from '../../../features/cpp_code_completion/compdb_service';
import {PackageInfo} from '../../../features/cpp_code_completion/packages';

export class SpiedCompdbService implements CompdbService {
  readonly requests: Array<{board: string; packageInfo: PackageInfo}> = [];

  async generate(board: string, packageInfo: PackageInfo) {
    this.requests.push({board, packageInfo});
  }
  isEnabled(): boolean {
    return true;
  }
}
