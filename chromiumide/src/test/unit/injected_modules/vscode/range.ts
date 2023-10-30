// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {Position} from './position';
import type * as vscode from 'vscode';

export class Range implements vscode.Range {
  readonly start: Position;
  readonly end: Position;

  get isEmpty(): boolean {
    return this.start.isEqual(this.end);
  }
  get isSingleLine(): boolean {
    return this.start.line === this.end.line;
  }

  constructor(start: vscode.Position, end: vscode.Position);
  constructor(
    startLine: number,
    startCharacter: number,
    endLine: number,
    endCharacter: number
  );
  constructor(
    startOrStartLine: vscode.Position | number,
    endOrStartCharacter: vscode.Position | number,
    endLine?: number,
    endCharacter?: number
  ) {
    if (typeof startOrStartLine === 'number') {
      this.start = new Position(
        startOrStartLine,
        endOrStartCharacter as number
      );
      this.end = new Position(endLine!, endCharacter!);
    } else {
      this.start = startOrStartLine;
      this.end = endOrStartCharacter as vscode.Position;
    }
  }

  contains(_positionOrRange: vscode.Range | vscode.Position): boolean {
    throw new Error('Not implemented');
  }

  intersection(_range: vscode.Range): vscode.Range {
    throw new Error('Not implemented');
  }

  isEqual(other: vscode.Range): boolean {
    return this.start.isEqual(other.start) && this.end.isEqual(other.end);
  }

  union(_other: vscode.Range): vscode.Range {
    throw new Error('Not implemented');
  }

  with(start?: vscode.Position, end?: vscode.Position): vscode.Range;
  with(change: {end: vscode.Position; start: vscode.Position}): vscode.Range;
  with(): vscode.Range {
    throw new Error('Not implemented');
  }
}
