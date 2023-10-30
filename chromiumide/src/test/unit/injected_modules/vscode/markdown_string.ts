// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import type * as vscode from 'vscode';

export class MarkdownString {
  baseUri?: vscode.Uri;
  isTrusted?: boolean | {enabledCommands: readonly string[]};
  supportHtml?: boolean;

  constructor(readonly value?: string, readonly supportThemeIcons?: boolean) {}

  appendCodeblock(_value: string, _language?: string): MarkdownString {
    throw new Error('Not implemented');
  }

  appendMarkdown(_value: string): MarkdownString {
    throw new Error('Not implemented');
  }

  appendText(_value: string): MarkdownString {
    throw new Error('Not implemented');
  }
}
