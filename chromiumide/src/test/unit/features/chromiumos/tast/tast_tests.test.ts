// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as path from 'path';
import * as vscode from 'vscode';
import {TastTests} from '../../../../../features/chromiumos/tast/tast_tests';
import * as services from '../../../../../services';
import * as testing from '../../../../testing';
import {FakeTextDocument} from '../../../../testing/fakes/text_document';

function workspaceFolder(fsPath: string): vscode.WorkspaceFolder {
  return {
    uri: vscode.Uri.file(fsPath),
  } as vscode.WorkspaceFolder;
}

describe('TastTests', () => {
  const tempDir = testing.tempDir();

  const {vscodeEmitters, vscodeSpy, vscodeGetters} =
    testing.installVscodeDouble();
  testing.installFakeConfigs(vscodeSpy, vscodeEmitters);

  const state = testing.cleanState(async () => {
    const chromiumosRoot = tempDir.path;

    await testing.buildFakeChroot(chromiumosRoot);
    const chrootService =
      services.chromiumos.ChrootService.maybeCreate(chromiumosRoot)!;

    const tastTests = new TastTests(chrootService);

    const initializeEvents = new testing.EventReader(tastTests.onDidInitialize);
    const changeEvents = new testing.EventReader(tastTests.onDidChange);

    return {
      chromiumosRoot,
      tastTests,
      initializeEvents,
      changeEvents,
    };
  });

  afterEach(() => {
    TastTests.resetGlobalStateForTesting();

    vscode.Disposable.from(
      state.changeEvents,
      state.initializeEvents,
      state.tastTests
    ).dispose();
  });

  const GOOD_GOPATHS: string[] = [
    'src/platform/tast',
    'src/platform/tast-tests',
    'chroot/usr/lib/gopath',
  ];

  const GOOD_WORKSPACE_FOLDERS: string[] = [
    'src/platform/tast',
    'src/platform/tast-tests',
  ];

  function setUpFakes(
    chromiumosRoot: string,
    opts: {
      hasGolangExtension: boolean;
      gopaths: string[];
      workspaceFolders: string[];
    }
  ) {
    if (opts.hasGolangExtension) {
      vscodeSpy.extensions.getExtension
        .withArgs('golang.Go')
        .and.returnValue({} as vscode.Extension<void>);
    }

    vscodeSpy.commands.executeCommand
      .withArgs('go.gopath')
      .and.resolveTo(
        opts.gopaths.map(x => path.join(chromiumosRoot, x)).join(':')
      );

    vscodeGetters.workspace.workspaceFolders.and.returnValue(
      opts.workspaceFolders.map(x =>
        workspaceFolder(path.join(chromiumosRoot, x))
      )
    );
  }

  const GOOD_SETUP = {
    hasGolangExtension: true,
    gopaths: GOOD_GOPATHS,
    workspaceFolders: GOOD_WORKSPACE_FOLDERS,
  };

  it('creates test item from visible test editor', async () => {
    setUpFakes(state.chromiumosRoot, GOOD_SETUP);
    await state.tastTests.initialize();

    expect(await state.initializeEvents.read()).toBeTrue();

    // Golang uses tab for indentation and spaces for vertical alignment.
    const tastTestContent = `
func init() {
\ttesting.AddTest(&testing.Test{
\t\tFunc:         LocalPass,
\t\tDesc:         "Always passes",
\t})
}

func LocalPass(ctx context.Context, s *testing.State) {
}
`;

    const fileName = path.join(
      state.chromiumosRoot,
      'src/platform/tast-tests/path/to/local_pass.go'
    );

    const firstDocument: vscode.TextDocument = new FakeTextDocument({
      uri: vscode.Uri.file(fileName),
      text: tastTestContent,
      languageId: 'go',
    });

    vscodeEmitters.window.onDidChangeVisibleTextEditors.fire([
      {
        document: firstDocument,
      } as vscode.TextEditor,
    ]);

    await state.changeEvents.read();

    expect(state.tastTests.lazyTestController.getOrCreate().items.size).toEqual(
      1
    );

    vscodeEmitters.window.onDidChangeVisibleTextEditors.fire([]);

    await state.changeEvents.read();

    expect(state.tastTests.lazyTestController.getOrCreate().items.size).toEqual(
      0
    );
  });

  for (const testCase of [
    {
      name: 'initializes successfully on proper setup',
      ...GOOD_SETUP,
      wantSuccess: true,
    },
    {
      name: 'fails to initialize if Go extension is not installed',
      ...GOOD_SETUP,
      hasGolangExtension: false,
      wantSuccess: false,
    },
    {
      name: 'fails to initialize if gopath does not contain chroot gopath',
      ...GOOD_SETUP,
      gopaths: ['src/platform/tast', 'src/platform/tast-tests'],
      wantSuccess: false,
    },
    {
      name: 'fails to initialize if workspace does not contain tast',
      ...GOOD_SETUP,
      workspaceFolders: ['src/platform/tast-tests'],
      wantSuccess: false,
    },
  ]) {
    it(testCase.name, async () => {
      setUpFakes(state.chromiumosRoot, testCase);
      await state.tastTests.initialize();

      expect(await state.initializeEvents.read()).toEqual(testCase.wantSuccess);
    });
  }
});
