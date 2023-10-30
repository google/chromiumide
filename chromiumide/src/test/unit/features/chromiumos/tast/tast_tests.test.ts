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
  const {vscodeEmitters, vscodeSpy} = testing.installVscodeDouble();
  testing.installFakeConfigs(vscodeSpy, vscodeEmitters);

  const tempDir = testing.tempDir();

  const subscriptions: vscode.Disposable[] = [];
  afterEach(() => {
    TastTests.resetGlobalStateForTesting();
    vscode.Disposable.from(...subscriptions.reverse()).dispose();
    subscriptions.splice(0);
  });

  const GOOD_GOPATHS: readonly string[] = [
    'src/platform/tast',
    'src/platform/tast-tests',
    'chroot/usr/lib/gopath',
  ];

  const GOOD_WORKSPACE_FOLDERS: readonly string[] = [
    'src/platform/tast',
    'src/platform/tast-tests',
  ];

  type TestCase = {
    readonly name: string;
    readonly hasGolangExtension: boolean;
    readonly gopaths: readonly string[];
    readonly workspaceFolders: readonly string[];
    readonly wantSuccess: boolean;
  };

  it('creates test item from visible test editor', async () => {
    const root = tempDir.path;

    await testing.buildFakeChroot(root);
    const chrootService = services.chromiumos.ChrootService.maybeCreate(root)!;

    vscodeSpy.extensions.getExtension
      .withArgs('golang.Go')
      .and.returnValue({} as vscode.Extension<void>);

    vscodeSpy.commands.executeCommand
      .withArgs('go.gopath')
      .and.resolveTo(GOOD_SETUP.gopaths.map(x => path.join(root, x)).join(':'));

    const tastTests = new TastTests(chrootService, () =>
      GOOD_SETUP.workspaceFolders.map(x => workspaceFolder(path.join(root, x)))
    );
    subscriptions.push(tastTests);

    const initializeEvents = new testing.EventReader(tastTests.onDidInitialize);
    const changeEvents = new testing.EventReader(tastTests.onDidChange);
    subscriptions.push(initializeEvents, changeEvents);

    expect(await initializeEvents.read()).toBeTrue();

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
      root,
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

    await changeEvents.read();

    expect(tastTests.lazyTestController.getOrCreate().items.size).toEqual(1);

    vscodeEmitters.window.onDidChangeVisibleTextEditors.fire([]);

    await changeEvents.read();

    expect(tastTests.lazyTestController.getOrCreate().items.size).toEqual(0);
  });

  const GOOD_SETUP: Omit<TestCase, 'name' | 'wantSuccess'> = {
    hasGolangExtension: true,
    gopaths: GOOD_GOPATHS,
    workspaceFolders: GOOD_WORKSPACE_FOLDERS,
  };

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
  ] as TestCase[]) {
    it(testCase.name, async () => {
      const root = tempDir.path;

      await testing.buildFakeChroot(root);
      const chrootService =
        services.chromiumos.ChrootService.maybeCreate(root)!;

      if (testCase.hasGolangExtension) {
        vscodeSpy.extensions.getExtension
          .withArgs('golang.Go')
          .and.returnValue({} as vscode.Extension<void>);
      }

      vscodeSpy.commands.executeCommand
        .withArgs('go.gopath')
        .and.resolveTo(testCase.gopaths.map(x => path.join(root, x)).join(':'));

      const tastTests = new TastTests(chrootService, () =>
        testCase.workspaceFolders.map(x => workspaceFolder(path.join(root, x)))
      );
      subscriptions.push(tastTests);

      const initializeEvent = new testing.EventReader(
        tastTests.onDidInitialize
      );
      subscriptions.push(initializeEvent);

      expect(await initializeEvent.read()).toEqual(testCase.wantSuccess);
    });
  }
});
