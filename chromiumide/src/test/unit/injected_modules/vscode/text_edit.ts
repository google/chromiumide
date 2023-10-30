// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {EndOfLine} from './end_of_line';
import {Position} from './position';
import {Range} from './range';

export class TextEdit {
  newEol?: EndOfLine;

  constructor(public range: Range, public newText: string) {}

  static delete(range: Range): TextEdit {
    return new TextEdit(range, '');
  }

  static insert(position: Position, newText: string): TextEdit {
    return new TextEdit(new Range(position, position), newText);
  }

  static replace(range: Range, newText: string): TextEdit {
    return new TextEdit(range, newText);
  }

  static setEndOfLine(eol: EndOfLine): TextEdit {
    const edit = new TextEdit(new Range(0, 0, 0, 0), '');
    edit.newEol = eol;
    return edit;
  }
}
