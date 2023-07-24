// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import type * as vscode from 'vscode';

export const STATUS_TASK_NAME = 'Platform EC';
export const SHOW_LOG_COMMAND: vscode.Command = {
  command: 'chromiumide.showPlatformEcLog',
  title: 'Show Platform EC Log',
};
