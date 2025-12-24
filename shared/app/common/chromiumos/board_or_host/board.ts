// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {getDriver} from '../../driver_repository';
import {CommonInterface, HOST_AS_STRING} from './common_interface';

const driver = getDriver();

export class Board implements CommonInterface {
  private static readonly knownBoards = new Map<string, Board>();

  private constructor(private readonly board: string) {
    if (board === HOST_AS_STRING) {
      throw new Error(`Internal error: invalid board name ${board}`);
    }
    if (Board.knownBoards.has(this.toString())) {
      throw new Error(
        `Internal error: same BoardOrHost object was created for ${this.toString()}`
      );
    }
  }

  static newBoard(name: string): Board {
    const existing = this.knownBoards.get(name);
    if (existing) return existing;
    const res = new this(name);
    this.knownBoards.set(name, res);
    return res;
  }

  map<T>(f: (board: string) => T, _v: T): T {
    return f(this.board);
  }

  toString(): string {
    return this.board;
  }

  toBoardName(): string {
    return this.board;
  }

  sysroot(): string {
    return driver.path.join('/build', this.board);
  }

  suffixedExecutable(
    name: 'emerge' | 'equery' | 'ebuild' | 'portageq'
  ): string {
    return `${name}-${this.board}`;
  }
}
