// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import type * as vscode from 'vscode';

export {createStatusBarItem} from '../status_bar';
export {createOutputChannel} from './output_channel';
export {createTextEditorDecorationType} from './text_editor_decoration_type';
export {createTreeView} from './tree_view';
export {withProgress} from './with_progress';

export const visibleTextEditors: typeof vscode.window.visibleTextEditors =
  Object.freeze([]);
