// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * Ticket used to prevent reversal of processing order in watcher.
 */
export class Ticket {
  private static ticket = 0;
  private readonly value = Ticket.ticket++;
  constructor() {}

  newerThan(other: Ticket): boolean {
    return this.value > other.value;
  }
}
