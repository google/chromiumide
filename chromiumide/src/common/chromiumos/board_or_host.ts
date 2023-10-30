// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import path from 'path';

/**
 * An immutable data class representing ChromeOS's board or host. It is guaranteed that two
 * instances of this class representing the same board or host are identical, so this class can be
 * used as the key of Set or Map.
 */
export class BoardOrHost {
  /** String representation of host. Calling toString() to host returns it. */
  static readonly HOST_AS_STRING = 'host';

  private static readonly knownBoards = new Map<string, BoardOrHost>();

  /** The unique instance representing the host. */
  static readonly HOST = new this({isHost: true});

  /** Creates an instance representing a board. The board name must not be "host". */
  static newBoard(name: string): BoardOrHost {
    const existing = this.knownBoards.get(name);
    if (existing) return existing;
    const res = new this({isHost: false, board: name});
    this.knownBoards.set(name, res);
    return res;
  }

  /** Parses string representation of BoardOrHost. */
  static parse(s: string): BoardOrHost {
    return s === BoardOrHost.HOST_AS_STRING ? this.HOST : this.newBoard(s);
  }

  private constructor(
    private readonly boardOrHost:
      | {readonly isHost: true}
      | {readonly isHost: false; readonly board: string}
  ) {
    if (
      !boardOrHost.isHost &&
      boardOrHost.board === BoardOrHost.HOST_AS_STRING
    ) {
      throw new Error(
        `Internal error: invalid board name ${boardOrHost.board}`
      );
    }
    if (BoardOrHost.knownBoards.has(this.toString())) {
      throw new Error(
        `Internal error: same BoardOrHost object was created for ${this.toString()}`
      );
    }
  }

  /**
   * Maps the board or host. If `this` represents a board, it is mapped via the first argument and
   * otherwise (if `this` represents the host), it is mapped to the second argument.
   */
  map<T>(f: (board: string) => T, v: T): T {
    return this.boardOrHost.isHost ? v : f(this.boardOrHost.board);
  }

  get isHost(): boolean {
    return this.boardOrHost.isHost;
  }

  /**
   * Returns the string representation of board or host. Note the difference from toBoardName(),
   * which returns an SDK board name for host.
   *
   * BoardOrHost.parse is the inverse function of toString(), i.e. for any BoardOrHost instance bh,
   * BoardOrHost.parse(bh.toString()) will produce an instance representing the same board or host.
   */
  toString(): string {
    return this.boardOrHost.isHost
      ? BoardOrHost.HOST_AS_STRING
      : this.boardOrHost.board;
  }

  /** Returns the SDK board name for host, and the board name for board. */
  toBoardName(): string {
    return this.map(b => b, 'amd64-host');
  }

  /**
   * Result of `portageq envvar SYSROOT`.
   */
  sysroot(): string {
    return this.map(b => path.join('/build', b), '/');
  }

  /**
   * The name of the executable inside chroot.
   */
  suffixedExecutable(
    name: 'emerge' | 'equery' | 'ebuild' | 'portageq'
  ): string {
    return this.map(b => `${name}-${b}`, name);
  }
}
