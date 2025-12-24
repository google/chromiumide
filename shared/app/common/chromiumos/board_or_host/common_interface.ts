// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/** String representation of host. Calling toString() to host returns it. */
export const HOST_AS_STRING = 'host';

export interface CommonInterface {
  /**
   * Maps the board or host. If `this` represents a board, it is mapped via the first argument and
   * otherwise (if `this` represents the host), it is mapped to the second argument.
   */
  map<T>(f: (board: string) => T, v: T): T;

  /**
   * Returns the string representation of board or host. Note the difference from toBoardName(),
   * which returns an SDK board name for host.
   *
   * BoardOrHost.parse is the inverse function of toString(), i.e. for any BoardOrHost instance bh,
   * BoardOrHost.parse(bh.toString()) will produce an instance representing the same board or host.
   */
  toString(): string;

  /** Returns the SDK board name for host, and the board name for board. */
  toBoardName(): string;

  /**
   * Result of `portageq envvar SYSROOT`.
   */
  sysroot(): string;

  /**
   * The name of the executable inside chroot.
   */
  suffixedExecutable(name: 'emerge' | 'equery' | 'ebuild' | 'portageq'): string;
}
