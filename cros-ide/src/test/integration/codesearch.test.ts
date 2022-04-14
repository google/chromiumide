// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import 'jasmine';
import * as vscode from 'vscode';
import * as codesearch from '../../features/codesearch';

const {CodeSearch} = codesearch.TEST_ONLY;

/**
 * Fake implementation of `vscode.WorkspaceConfiguration`.
 *
 * We cannot use the real implementation, because it would make test read and write developers'
 * VSCode configuration.
 *
 * Instead of implementing the entire class, we only just implement `get` and use `as` keyword
 * to ignore type checking.
 */
class FakeWorkspaceConfiguration {
  constructor(private readonly value: string) {}

  asVscodeType(): vscode.WorkspaceConfiguration {
    // We need to go through unknown. Otherwise, TypeScript will not let us type cast.
    return this as unknown as vscode.WorkspaceConfiguration;
  }

  get(section: string): string {
    if (section != 'codeSearch') {
      throw new Error(`unexpected section: ${section}`);
    }
    return this.value;
  }
}

describe('CodeSearch: searching for selection', () => {
  let textEditor: vscode.TextEditor;

  beforeAll(async () => {
    const textDocument = await vscode.workspace.openTextDocument({
      content: 'Give people the power to share\nand make the world more open and connected.'});
    textEditor = await vscode.window.showTextDocument(textDocument);
    textEditor.selection = new vscode.Selection(0, 5, 0, 11); // selects 'people'
  });

  it('in public CS', async () => {
    // TODO(ttylenda): Figure our how to stub WorkspaceConfiguration better.
    const config = new FakeWorkspaceConfiguration('public').asVscodeType();
    const openExternal = spyOn(vscode.env, 'openExternal');

    const codeSearch = new CodeSearch(() => config);

    // TODO(ttylenda): Call the VSCode command instead calling the TS method.
    codeSearch.searchSelection(textEditor);

    const expectedUri = vscode.Uri.parse('https://source.chromium.org/search?q=people');
    expect(openExternal).toHaveBeenCalledWith(expectedUri);
  });

  it('in internal CS', async () => {
    const config = new FakeWorkspaceConfiguration('internal').asVscodeType();
    const openExternal = spyOn(vscode.env, 'openExternal');

    const codeSearch = new CodeSearch(() => config);

    codeSearch.searchSelection(textEditor);

    const expectedUri = vscode.Uri.parse('https://source.corp.google.com/search?q=people');
    expect(openExternal).toHaveBeenCalledWith(expectedUri);
  });
});

// TODO(ttylenda): Test opening the current file.
