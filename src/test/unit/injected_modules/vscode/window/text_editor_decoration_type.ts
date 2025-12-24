// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import type * as vscode from 'vscode';

export function createTextEditorDecorationType(
  _options: vscode.DecorationRenderOptions
): vscode.TextEditorDecorationType {
  return {
    key: '',
    dispose() {},
  };
}
