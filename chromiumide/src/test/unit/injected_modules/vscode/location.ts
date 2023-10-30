// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {Position} from './position';
import {Range} from './range';
import {Uri} from './uri';

export class Location {
  range: Range;

  constructor(public uri: Uri, rangeOrPosition: Range | Position) {
    if (rangeOrPosition instanceof Range) {
      this.range = rangeOrPosition;
    } else {
      this.range = new Range(rangeOrPosition, rangeOrPosition);
    }
  }
}
