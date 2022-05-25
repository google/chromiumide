// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as path from 'path';
import * as vscode from 'vscode';
import * as codesearch from '../../features/codesearch';
import {
  buildFakeChroot,
  cleanState,
  closeDocument,
  exactMatch,
  installFakeExec,
  tempDir,
} from '../testing';
import {installVscodeDouble} from '../doubles';
import {fakeGetConfiguration} from '../fakes/workspace_configuration';

const {openCurrentFile, searchSelection} = codesearch.TEST_ONLY;

describe('CodeSearch: searching for selection', () => {
  const {vscodeSpy} = installVscodeDouble();

  let textDocument: vscode.TextDocument;
  let textEditor: vscode.TextEditor;

  beforeAll(async () => {
    textDocument = await vscode.workspace.openTextDocument({
      content:
        'Give people the power to share\nand make the world more open and connected.',
    });
    textEditor = await vscode.window.showTextDocument(textDocument);
    textEditor.selection = new vscode.Selection(0, 5, 0, 11); // selects 'people'
  });

  afterAll(async () => {
    await closeDocument(textDocument);
  });

  it('in public CS', async () => {
    vscodeSpy.workspace.getConfiguration.and.callFake(fakeGetConfiguration());
    vscode.workspace
      .getConfiguration('cros-ide')
      .update('codeSearch', 'public');

    // TODO(ttylenda): Call the VSCode command instead calling the TS method.
    searchSelection(textEditor);

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

    searchSelection(textEditor);

    const expectedUri = vscode.Uri.parse(
      'https://source.corp.google.com/search?q=people'
    );
    expect(vscodeSpy.env.openExternal).toHaveBeenCalledWith(expectedUri);
  });
});

describe('CodeSearch: opening current file', () => {
  const {vscodeSpy} = installVscodeDouble();
  const {fakeExec} = installFakeExec();
  const temp = tempDir();

  const state = cleanState(async () => {
    await buildFakeChroot(temp.path);

    const documentFileName = path.join(
      temp.path,
      'chromiumos/src/platform2/cros-disks/archive_mounter.cc'
    );

    return {
      // We need an editor with file path, so we cannot use a real object
      // like in the tests which open selection.
      fakeTextEditor: {
        document: {
          fileName: documentFileName,
        },
        selection: {
          active: {
            line: 40,
          },
        },
      } as unknown as vscode.TextEditor,

      fakeCodeSearchToolConfig: {
        executable: '/mnt/host/source/chromite/contrib/generate_cs_path',
        cwd: '/tmp',
      },

      generateCsPathInvocation: [
        '--show',
        '--public',
        '--line=41',
        documentFileName,
      ],
    };
  });

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
      path.join(temp.path, 'chromite/contrib/generate_cs_path'),
      exactMatch(state.generateCsPathInvocation, async () => {
        return CS_LINK;
      })
    );

    await openCurrentFile(state.fakeTextEditor);

    const expectedUri = vscode.Uri.parse(CS_LINK);
    expect(vscodeSpy.env.openExternal).toHaveBeenCalledWith(expectedUri);
  });

  it('shows error popup when generate_cs_link cannot be found', async () => {
    fakeExec.on(
      path.join(temp.path, 'chromite/contrib/generate_cs_path'),
      exactMatch(state.generateCsPathInvocation, async () => {
        return Error('not found');
      })
    );

    await openCurrentFile(state.fakeTextEditor);

    expect(vscodeSpy.window.showErrorMessage).toHaveBeenCalledWith(
      'Could not run generate_cs_path: Error: not found'
    );
  });

  it('shows error popup when generate_cs_link fails', async () => {
    fakeExec.on(
      path.join(temp.path, 'chromite/contrib/generate_cs_path'),
      exactMatch(state.generateCsPathInvocation, async () => {
        return {stdout: '', stderr: 'error msg', exitStatus: 1};
      })
    );

    await openCurrentFile(state.fakeTextEditor);

    expect(vscodeSpy.window.showErrorMessage).toHaveBeenCalledWith(
      'generate_cs_path returned an error: error msg'
    );
  });
});
