// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {VscodeComment, VscodeCommentThread} from '../data';
import {EditingStatus} from '../model/editing_status';
import {Sink} from '../sink';

export type CommandContext = {
  sink: Sink;
  editingStatus: EditingStatus;
  /**
   * Gets the comment thread the comment belongs to.
   */
  getCommentThread(comment: VscodeComment): VscodeCommentThread | undefined;
};
