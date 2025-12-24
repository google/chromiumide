// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {Board} from './board';
import {HOST_AS_STRING} from './common_interface';
import {Host} from './host';

export {Board, Host, HOST_AS_STRING};

/** The unique instance representing the host. */
export const HOST = Host.getInstance();

/**
 * An immutable data class representing ChromeOS's board or host. It is guaranteed that two
 * instances of this class representing the same board or host are identical, so this class can be
 * used as the key of Set or Map.
 */
export type BoardOrHost = Board | Host;

/** Parses string representation of BoardOrHost. */
export function parseBoardOrHost(s: string): BoardOrHost {
  return s === HOST_AS_STRING ? HOST : Board.newBoard(s);
}
