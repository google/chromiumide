// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as path from 'path';
import * as vscode from 'vscode';
import * as codesearch from '../../../features/codesearch';
import * as config from '../../../services/config';
import {
  buildFakeChroot,
  cleanState,
  installFakeExec,
  tempDir,
} from '../../testing';
import {installVscodeDouble, installFakeConfigs} from '../../testing/doubles';
import {FakeTextDocument} from '../../testing/fakes';
import {buildFakeChromium} from '../../testing/fs';

const {copyCurrentFile, openCurrentFile, searchSelection} =
  codesearch.TEST_ONLY;

describe('CodeSearch: searching for selection', () => {
  const {vscodeSpy, vscodeEmitters} = installVscodeDouble();
  installFakeConfigs(vscodeSpy, vscodeEmitters);

  let textEditor: vscode.TextEditor;

  beforeAll(async () => {
    const textDocument: vscode.TextDocument = new FakeTextDocument({
      text: 'Give people the power to share\nand make the world more open and connected.',
    });

    textEditor = {
      document: textDocument,
      selection: new vscode.Selection(0, 5, 0, 11), // selects 'people'
    } as vscode.TextEditor;
  });

  it('in public CS', async () => {
    await config.codeSearch.instance.update('public');

    // TODO(ttylenda): Call the VSCode command instead calling the TS method.
    searchSelection(textEditor);

    const expectedUri = vscode.Uri.parse(
      'https://source.chromium.org/search?q=people'
    );
    expect(vscodeSpy.env.openExternal).toHaveBeenCalledWith(expectedUri);
  });

  it('in internal CS', async () => {
    await config.codeSearch.instance.update('internal');

    searchSelection(textEditor);

    const expectedUri = vscode.Uri.parse(
      'https://source.corp.google.com/search?q=people'
    );
    expect(vscodeSpy.env.openExternal).toHaveBeenCalledWith(expectedUri);
  });
});

describe('CodeSearch: opening current file', () => {
  const {vscodeSpy, vscodeEmitters} = installVscodeDouble();
  installFakeConfigs(vscodeSpy, vscodeEmitters);
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

  beforeEach(async () => {
    await config.codeSearch.instance.update('public');
  });

  it('opens browser window', async () => {
    const CS_LINK =
      'https://source.chromium.org/chromiumos/chromiumos/codesearch/+/HEAD:' +
      'src/platform2/cros-disks/archive_mounter.cc;l=41';

    fakeExec.installStdout(
      path.join(temp.path, 'chromite/contrib/generate_cs_path'),
      state.generateCsPathInvocation,
      CS_LINK
    );

    await openCurrentFile(state.fakeTextEditor);

    const expectedUri = vscode.Uri.parse(CS_LINK);
    expect(vscodeSpy.env.openExternal).toHaveBeenCalledWith(expectedUri);
  });

  it('shows error popup when generate_cs_link cannot be found', async () => {
    fakeExec.installCallback(
      path.join(temp.path, 'chromite/contrib/generate_cs_path'),
      state.generateCsPathInvocation,
      async () => new Error('not found')
    );

    await openCurrentFile(state.fakeTextEditor);

    expect(vscodeSpy.window.showErrorMessage).toHaveBeenCalledWith(
      'Could not run generate_cs_path: Error: not found'
    );
  });

  it('opens chromium source code on chromium code search', async () => {
    await buildFakeChromium(temp.path);

    const filepath = path.join(temp.path, 'src/ash/BUILD.gn');

    const textEditor = {
      document: {
        fileName: filepath,
      },
      selection: {active: {line: 5}},
    } as vscode.TextEditor;

    await openCurrentFile(textEditor);

    const expectedUri = vscode.Uri.parse(
      'https://source.chromium.org/chromium/chromium/src/+/main:ash/BUILD.gn;l=6'
    );
    expect(vscodeSpy.env.openExternal).toHaveBeenCalledWith(expectedUri);
  });

  it('copies encoded URI', async () => {
    await buildFakeChromium(temp.path);

    const filepath = path.join(temp.path, 'src/fake file with spaces.md');

    const textEditor = {
      document: {
        fileName: filepath,
      },
      selection: {active: {line: 7}},
    } as vscode.TextEditor;

    await copyCurrentFile(textEditor);

    const expectedText =
      'https://source.chromium.org/chromium/chromium/src/+/main:fake%20file%20with%20spaces.md;l=8';

    expect(await vscode.env.clipboard.readText()).toEqual(expectedText);
  });

  it('shows error popup when generate_cs_link fails', async () => {
    fakeExec.installCallback(
      path.join(temp.path, 'chromite/contrib/generate_cs_path'),
      state.generateCsPathInvocation,
      async () => ({stdout: '', stderr: 'error msg', exitStatus: 1})
    );

    await openCurrentFile(state.fakeTextEditor);

    expect(vscodeSpy.window.showErrorMessage).toHaveBeenCalledWith(
      'generate_cs_path returned an error: error msg'
    );
  });
});
