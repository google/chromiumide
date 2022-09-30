// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {TEST_ONLY} from '../../../features/new_file_template';

const {textToInsert} = TEST_ONLY;

function textDocument(
  languageId: string,
  lineCount: number
): vscode.TextDocument {
  return {
    languageId,
    lineCount,
  } as vscode.TextDocument;
}

describe('New file template', () => {
  it('creates right license header', () => {
    expect(textToInsert(textDocument('cpp', 1))).toMatch(
      /\/\/ Copyright \d+ The ChromiumOS Authors\n/
    );

    expect(textToInsert(textDocument('python', 1))).toMatch(
      /# Copyright \d+ The ChromiumOS Authors\n/
    );

    expect(textToInsert(textDocument('unknown', 1))).toBeUndefined();
  });

  it('does not insert header for copied file', () => {
    expect(textToInsert(textDocument('cpp', 123))).toBeUndefined();
  });
});
