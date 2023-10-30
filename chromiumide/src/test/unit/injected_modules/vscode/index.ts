// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as debugModule from './debug';
import * as envModule from './env';
import * as extensionsModule from './extensions';
import * as tasksModule from './tasks';
import * as testsModule from './tests';
import * as windowModule from './window';
import * as workspaceModule from './workspace';
import type * as vscode from 'vscode';

export {CancellationTokenSource} from './cancellation_token';
export {CommentMode} from './comment_mode';
export {CommentThreadCollapsibleState} from './comment_thread_collapsible_state';
export {CommentThreadState} from './comment_thread_state';
export {ConfigurationTarget} from './configuration';
export {Disposable} from './disposable';
export {DocumentLink} from './document_link';
export {EndOfLine} from './end_of_line';
export {EventEmitter} from './event';
export {ExtensionMode} from './extension_mode';
export {FileType} from './file_type';
export {Hover} from './hover';
export {Location} from './location';
export {LogLevel} from './log_level';
export {MarkdownString} from './markdown_string';
export {Position} from './position';
export {Progress} from './progress';
export {ProgressLocation} from './progress_location';
export {Range} from './range';
export {StatusBarAlignment, StatusBarItem} from './status_bar';
export {Selection} from './selection';
export {TestMessage} from './test_message';
export {TestRunProfileKind} from './test_run_profile_kind';
export {TextEdit} from './text_edit';
export {ThemeColor} from './theme_color';
export {ThemeIcon} from './theme_icon';
export {TreeItem} from './tree_item';
export {TreeItemCollapsibleState} from './tree_item_collapsible_state';
export type {TreeItemLabel} from './tree_item_label';
export {UIKind} from './ui_kind';
export {Uri} from './uri';

export const debug = debugModule;
export let commands = {};
export let comments = {};
export let env = envModule;
export let extensions = extensionsModule;
export const tasks = tasksModule;
export const tests = testsModule;
export let window = windowModule;
export let workspace = workspaceModule;

export function setVscode(double: {
  commands: typeof vscode.commands;
  comments: typeof vscode.comments;
  env: typeof vscode.env;
  extensions: typeof vscode.extensions;
  window: typeof vscode.window;
  workspace: typeof vscode.workspace;
}): void {
  commands = double.commands;
  comments = double.comments;
  env = double.env;
  extensions = double.extensions;
  window = double.window;
  workspace = double.workspace;
}
