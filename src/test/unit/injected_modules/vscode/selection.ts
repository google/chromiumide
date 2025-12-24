// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {Position} from './position';
import {Range} from './range';

export class Selection extends Range implements vscode.Selection {
  anchor: vscode.Position;
  active: vscode.Position;

  get isReversed(): boolean {
    return this.anchor.isEqual(this.end);
  }

  constructor(anchor: vscode.Position, active: vscode.Position);
  constructor(
    anchorLine: number,
    anchorCharacter: number,
    activeLine: number,
    activeCharacter: number
  );

  constructor(
    anchorOrAnchorLine: vscode.Position | number,
    activeOrAnchorCharacter: vscode.Position | number,
    activeLine?: number,
    activeCharacter?: number
  ) {
    // Cast to stop the error of: The call would have succeeded against
    // this implementation, but implementation signatures of overloads are not
    // externally visible.
    super(
      anchorOrAnchorLine as number,
      activeOrAnchorCharacter as number,
      activeLine as number,
      activeCharacter as number
    );
    if (typeof anchorOrAnchorLine === 'number') {
      if (
        typeof activeOrAnchorCharacter !== 'number' ||
        typeof activeLine !== 'number' ||
        typeof activeCharacter !== 'number'
      ) {
        throw new Error('Seleciton: type mismatch');
      }
      this.anchor = new Position(anchorOrAnchorLine, activeOrAnchorCharacter);
      this.active = new Position(activeLine, activeCharacter);
    } else {
      if (typeof activeOrAnchorCharacter === 'number') {
        throw new Error('Selection: type mismatch');
      }
      this.anchor = anchorOrAnchorLine;
      this.active = activeOrAnchorCharacter;
    }
  }
}
