// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';

// realpath of ~/chromiumos
export const MNT_HOST_SOURCE = '/mnt/host/source';

export const SHOW_LOG_COMMAND: vscode.Command = {
  command: 'cros-ide.showCppLog',
  title: '',
};
