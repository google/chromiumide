// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import {TextDocument} from 'vscode-languageserver-textdocument';
import {URI} from 'vscode-uri';

export class VirtualFileSystem {
  private readonly files: {
    [path: string]: TextDocument;
  } = {};

  /** @param languageId Always use this languageId for files read from disk. */
  constructor(private readonly languageId: string) {}

  read(path: URI): TextDocument | undefined {
    const document = this.files[path.toString()];
    if (document !== undefined) {
      return document;
    }
    // Currently we only support the `file` scheme unless the file is open.
    // https://github.com/microsoft/language-server-protocol/issues/1264
    if (!path.fsPath) return undefined;

    // If a file is closed the truth of the file resides on disk.
    // https://github.com/microsoft/vscode-languageserver-node/issues/31#issuecomment-203045973
    let content: string;
    try {
      content = fs.readFileSync(path.fsPath, 'utf8');
    } catch {
      return undefined;
    }

    // Don't cache it to always read it from disk unless it is opened in VSCode.
    return TextDocument.create(
      path.toString(),
      this.languageId,
      /* version = */ 1,
      content
    );
  }

  write(path: URI, content: string): void {
    const existing = this.files[path.toString()];
    if (existing) {
      this.files[path.toString()] = TextDocument.create(
        existing.uri,
        existing.languageId,
        existing.version + 1,
        content
      );
      return;
    }
    this.files[path.toString()] = TextDocument.create(
      path.toString(),
      this.languageId,
      /* version = */ 1,
      content
    );
  }
}
