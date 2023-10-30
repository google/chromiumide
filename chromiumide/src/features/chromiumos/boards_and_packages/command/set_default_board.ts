// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as config from '../../../../services/config';

/** Sets the default board. */
export async function setDefaultBoard(board: string): Promise<void> {
  await config.board.update(board);
}
