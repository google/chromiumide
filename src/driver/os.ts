// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as os from 'os';
import {Os} from '../../shared/driver/os';

export class OsImpl implements Os {
  homedir(): string {
    return os.homedir();
  }
}
