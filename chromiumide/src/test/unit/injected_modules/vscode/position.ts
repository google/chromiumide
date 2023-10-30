// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import type * as vscode from 'vscode';

export class Position implements vscode.Position {
  constructor(readonly line: number, readonly character: number) {
    if (line < 0) {
      throw new Error('Illegal argument: line must be non-negative');
    }
    if (character < 0) {
      throw new Error('Illegal argument: character must be non-negative');
    }
  }

  compareTo(other: Position): number {
    if (this.line < other.line) return -1;
    if (this.line > other.line) return 1;
    if (this.character < other.character) return -1;
    if (this.character > other.character) return 1;
    return 0;
  }

  isAfter(other: Position): boolean {
    return this.compareTo(other) > 0;
  }

  isAfterOrEqual(other: Position): boolean {
    return this.compareTo(other) >= 0;
  }

  isBefore(other: Position): boolean {
    return this.compareTo(other) < 0;
  }

  isBeforeOrEqual(other: Position): boolean {
    return this.compareTo(other) <= 0;
  }

  isEqual(other: Position): boolean {
    return this.compareTo(other) === 0;
  }

  translate(_lineDelta?: number, _characterDelta?: number): Position;
  translate(_change: {lineDelta?: number; characterDelta?: number}): Position;
  translate(): Position {
    throw new Error('Not implemented');
  }

  with(_line?: number, _character?: number): Position;
  with(_change: {character: number; line: number}): Position;
  with(): Position {
    throw new Error('Not implemented');
  }
}
