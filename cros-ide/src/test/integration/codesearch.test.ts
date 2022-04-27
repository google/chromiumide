// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as codesearch from '../../features/codesearch';
import {cleanState, exactMatch, installFakeExec} from '../testing';
import {installVscodeDouble} from './doubles';
import {fakeGetConfiguration} from './fakes/workspace_configuration';

const {CodeSearch} = codesearch.TEST_ONLY;

describe('CodeSearch: searching for selection', () => {
  const {vscodeSpy} = installVscodeDouble();

  let textEditor: vscode.TextEditor;

  beforeAll(async () => {
    const textDocument = await vscode.workspace.openTextDocument({
      content:
        'Give people the power to share\nand make the world more open and connected.',
    });
    textEditor = await vscode.window.showTextDocument(textDocument);
    textEditor.selection = new vscode.Selection(0, 5, 0, 11); // selects 'people'
  });

  it('in public CS', async () => {
    vscodeSpy.workspace.getConfiguration.and.callFake(fakeGetConfiguration());
    vscode.workspace
      .getConfiguration('cros-ide')
      .update('codeSearch', 'public');

    const codeSearch = new CodeSearch();

    // TODO(ttylenda): Call the VSCode command instead calling the TS method.
    codeSearch.searchSelection(textEditor);

    const expectedUri = vscode.Uri.parse(
      'https://source.chromium.org/search?q=people'
    );
    expect(vscodeSpy.env.openExternal).toHaveBeenCalledWith(expectedUri);
  });

  it('in internal CS', () => {
    vscodeSpy.workspace.getConfiguration.and.callFake(fakeGetConfiguration());
    vscode.workspace
      .getConfiguration('cros-ide')
      .update('codeSearch', 'internal');

    const codeSearch = new CodeSearch();

    codeSearch.searchSelection(textEditor);

    const expectedUri = vscode.Uri.parse(
      'https://source.corp.google.com/search?q=people'
    );
    expect(vscodeSpy.env.openExternal).toHaveBeenCalledWith(expectedUri);
  });
});

describe('CodeSearch: opening current file', () => {
  const {vscodeSpy} = installVscodeDouble();
  const {fakeExec} = installFakeExec();

  const t = cleanState(() => ({
    codeSearch: new CodeSearch(),

    // We need an editor with file path, so we cannot use a real object
    // like in the tests which open selection.
    fakeTextEditor: {
      document: {
        fileName:
          '/home/sundar/chromiumos/src/platform2/cros-disks/archive_mounter.cc',
      },
      selection: {
        active: {
          line: 40,
        },
      },
    } as unknown as vscode.TextEditor,

    generateCsLinkInvocation:
      '~/chromiumos/chromite/contrib/generate_cs_path ' +
      '--show "--public" --line=41 ' +
      '"/home/sundar/chromiumos/src/platform2/cros-disks/archive_mounter.cc"',
  }));

  beforeEach(() => {
    vscodeSpy.workspace.getConfiguration.and.callFake(fakeGetConfiguration());
    vscode.workspace
      .getConfiguration('cros-ide')
      .update('codeSearch', 'public');
  });

  it('opens browser window', async () => {
    const CS_LINK =
      'https://source.chromium.org/chromiumos/chromiumos/codesearch/+/HEAD:' +
      'src/platform2/cros-disks/archive_mounter.cc;l=41';

    fakeExec.on(
      'sh',
      exactMatch(['-c', t.generateCsLinkInvocation], async () => {
        return CS_LINK;
      })
    );

    await t.codeSearch.openCurrentFile(t.fakeTextEditor);

    const expectedUri = vscode.Uri.parse(CS_LINK);
    expect(vscodeSpy.env.openExternal).toHaveBeenCalledWith(expectedUri);
  });

  it('shows error popup when generate_cs_link cannot be found', async () => {
    fakeExec.on(
      'sh',
      exactMatch(['-c', t.generateCsLinkInvocation], async () => {
        return Error('not found');
      })
    );

    await t.codeSearch.openCurrentFile(t.fakeTextEditor);

    expect(vscodeSpy.window.showErrorMessage).toHaveBeenCalledWith(
      'Could not run generate_cs_path: Error: not found'
    );
  });

  it('shows error popup when generate_cs_link fails', async () => {
    fakeExec.on(
      'sh',
      exactMatch(['-c', t.generateCsLinkInvocation], async () => {
        return {stdout: '', stderr: 'error msg', exitStatus: 1};
      })
    );

    await t.codeSearch.openCurrentFile(t.fakeTextEditor);

    expect(vscodeSpy.window.showErrorMessage).toHaveBeenCalledWith(
      'generate_cs_path returned an error: error msg'
    );
  });
});
