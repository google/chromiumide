// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as path from 'path';
import {Path} from '../../shared/driver/path';

export class PathImpl implements Path {
  join(...paths: string[]): string {
    return path.join(...paths);
  }
  dirname(pathInput: string): string {
    return path.dirname(pathInput);
  }
  basename(pathInput: string, suffix?: string | undefined): string {
    return path.basename(pathInput, suffix);
  }
  relative(from: string, to: string): string {
    return path.relative(from, to);
  }
  resolve(...paths: string[]): string {
    return path.resolve(...paths);
  }
  sep = path.sep;
}
