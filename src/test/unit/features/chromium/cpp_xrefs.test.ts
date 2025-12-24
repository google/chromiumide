// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {CppXrefs} from '../../../../common/cpp_xrefs/cpp_xrefs';
import {ChromiumCppXrefs} from '../../../../features/chromium/cpp_xrefs';
import * as testing from '../../../testing';
import {FakeStatusManager} from '../../../testing/fakes';

describe('Chromium C++ xrefs', () => {
  const tempDir = testing.tempDir();
  const {vscodeSpy, vscodeEmitters, vscodeGetters} =
    testing.installVscodeDouble();
  testing.installFakeConfigs(vscodeSpy, vscodeEmitters);

  beforeEach(() => {
    vscodeSpy.window.createOutputChannel.and.returnValue(
      new testing.fakes.VoidOutputChannel()
    );
    vscodeSpy.extensions.getExtension.and.returnValue({
      activate: () => Promise.resolve() as Thenable<void>,
    } as vscode.Extension<void>);
    vscodeSpy.commands.registerCommand('clangd.restart', () => {});
    vscodeSpy.commands.registerCommand('vscode.openFolder', () => {});
  });

  const fakeExec = testing.installFakeExec();

  const state = testing.cleanState(async () => {
    const chromiumRoot = tempDir.path;
    await testing.buildFakeChromium(chromiumRoot);

    const statusManager = new FakeStatusManager();
    const cppXrefs = new CppXrefs(statusManager);
    const chromiumCppXrefs = new ChromiumCppXrefs(chromiumRoot, cppXrefs);
    const maybeGenerateReader = new testing.EventReader(
      cppXrefs.onDidMaybeGenerate
    );

    return {
      chromiumRoot,
      cppXrefs,
      chromiumCppXrefs,
      maybeGenerateReader,
    };
  });

  afterEach(() => {
    state.maybeGenerateReader.dispose();
    state.cppXrefs.dispose();
  });

  it('should generate compilation database on C++ file save', async () => {
    await fs.promises.mkdir(
      path.join(state.chromiumRoot, 'src/out/current_link'),
      {
        recursive: true,
      }
    );

    let generatorCallCount = 0;
    fakeExec.installCallback(
      path.join(
        state.chromiumRoot,
        'src/tools/clang/scripts/generate_compdb.py'
      ),
      [
        '-p',
        'out/current_link',
        '-o',
        path.join(state.chromiumRoot, 'src/compile_commands.json'),
      ],
      async () => {
        generatorCallCount++;
        await fs.promises.writeFile(
          path.join(state.chromiumRoot, 'src/compile_commands.json'),
          '{}' // fake compdb content
        );
        return '';
      }
    );

    vscodeGetters.workspace.workspaceFolders.and.returnValue([
      {
        index: 0,
        name: 'src',
        uri: vscode.Uri.file(path.join(state.chromiumRoot, 'src')),
      },
    ]);

    const cppDocument = {
      fileName: path.join(state.chromiumRoot, 'src/foo.cc'),
      languageId: 'cpp',
    } as vscode.TextDocument;

    vscodeEmitters.workspace.onDidSaveTextDocument.fire(cppDocument);

    await state.maybeGenerateReader.read();

    expect(generatorCallCount).toEqual(1);

    vscodeEmitters.workspace.onDidSaveTextDocument.fire(cppDocument);

    await state.maybeGenerateReader.read();
    expect(generatorCallCount).toEqual(1); // not called again after success
  });

  type TestCase = {
    name: string;
    // Inputs
    noCurrentLink?: boolean;
    generateCompdbFailure?: Error;
    workspaceFolders: string[];
    chocieOnWarningMessage?: string;
    // Expectations
    wantErrorMessage?: jasmine.Expected<string>;
    wantOpenSrc?: boolean;
  };

  for (const testCase of [
    {
      name: 'should report it if current_link does not exist',
      noCurrentLink: true,
      workspaceFolders: ['src'],
      wantErrorMessage: jasmine.stringContaining(
        'see [our guide](http://go/chromiumide-doc-chromium-output-directory)'
      ),
    },
    {
      name: 'should report it if command fails',
      generateCompdbFailure: new Error('<fail>'),
      workspaceFolders: ['src'],
      wantErrorMessage:
        'Command to generate compilation database failed: <fail>',
    },
    {
      name: 'should warn if no workspace folder is src',
      workspaceFolders: ['foo'],
      chocieOnWarningMessage: 'Open src',
      wantOpenSrc: true,
    },
  ] as TestCase[]) {
    it(testCase.name, async () => {
      if (!testCase.noCurrentLink) {
        await fs.promises.mkdir(
          path.join(state.chromiumRoot, 'src/out/current_link'),
          {
            recursive: true,
          }
        );
      }

      fakeExec
        .withArgs(
          path.join(
            state.chromiumRoot,
            'src/tools/clang/scripts/generate_compdb.py'
          ),
          [
            '-p',
            'out/current_link',
            '-o',
            path.join(state.chromiumRoot, 'src/compile_commands.json'),
          ],
          jasmine.objectContaining({})
        )
        .and.callFake(async () => {
          if (testCase.generateCompdbFailure) {
            return testCase.generateCompdbFailure;
          }
          return {
            stdout: '',
            stderr: '',
            exitStatus: 0,
          };
        });

      vscodeGetters.workspace.workspaceFolders.and.returnValue(
        testCase.workspaceFolders.map(
          dir =>
            ({
              uri: vscode.Uri.file(path.join(state.chromiumRoot, dir)),
            } as vscode.WorkspaceFolder)
        )
      );

      if (testCase.chocieOnWarningMessage) {
        vscodeSpy.window.showWarningMessage.and.resolveTo(
          testCase.chocieOnWarningMessage
        );
      }
      vscodeSpy.window.showErrorMessage.and.resolveTo(undefined);

      vscodeEmitters.workspace.onDidSaveTextDocument.fire({
        fileName: path.join(state.chromiumRoot, 'src/foo.cc'),
        languageId: 'cpp',
      } as vscode.TextDocument);

      await state.maybeGenerateReader.read();

      if (testCase.wantOpenSrc) {
        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
          'vscode.openFolder',
          vscode.Uri.file(path.join(state.chromiumRoot, 'src'))
        );
      }
      if (testCase.wantErrorMessage) {
        expect(vscodeSpy.window.showErrorMessage).toHaveBeenCalledOnceWith(
          testCase.wantErrorMessage,
          'Show Log',
          'Ignore'
        );
      }
    });
  }
});
