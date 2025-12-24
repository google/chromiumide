// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import * as config from '../../../../../../shared/app/services/config';
import {TastTests} from '../../../../../features/chromiumos/tast/tast_tests';
import * as services from '../../../../../services';
import * as testing from '../../../../testing';
import {VoidOutputChannel} from '../../../../testing/fakes';
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

    await testing.buildFakeChromeos(chromiumosRoot);
    const chrootService =
      services.chromiumos.ChrootService.maybeCreate(chromiumosRoot)!;

    const output = new VoidOutputChannel();

    const tastTests = new TastTests(chrootService, output);

    const initializeEvents = new testing.EventReader(tastTests.onDidInitialize);
    const changeEvents = new testing.EventReader(tastTests.onDidChange);

    const subscriptions = [output, tastTests, initializeEvents, changeEvents];

    return {
      chromiumosRoot,
      tastTests,
      initializeEvents,
      changeEvents,
      subscriptions,
    };
  });

  afterEach(() => {
    TastTests.resetGlobalStateForTesting();

    vscode.Disposable.from(
      ...state.subscriptions.splice(0).reverse()
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

  it('warns if Go files under cros symlink is opened', async () => {
    setUpFakes(state.chromiumosRoot, GOOD_SETUP);

    await testing.putFiles(state.chromiumosRoot, {
      'src/platform/tast-tests/src/go.chromium.org/tast-tests/cros/local/bundles/cros/example/pass.go':
        '<test>',
    });
    await fs.promises.symlink(
      'src/go.chromium.org/tast-tests/cros',
      path.join(state.chromiumosRoot, 'src/platform/tast-tests/cros')
    );
    const testUnderSymlink = new FakeTextDocument({
      uri: vscode.Uri.file(
        path.join(
          state.chromiumosRoot,
          'src/platform/tast-tests/cros/local/bundles/cros/example/pass.go'
        )
      ),
      text: '<test>',
      languageId: 'go',
    }) as vscode.TextDocument;

    await state.tastTests.initialize();
    expect(await state.initializeEvents.read()).toBeTrue();

    const checkSymlinkEvents = new testing.EventReader(
      state.tastTests.onDidCheckSymlinkForTesting,
      state.subscriptions
    );

    await config.vscode.files.exclude.update({});

    vscodeSpy.window.showWarningMessage.and.returnValue('Yes and hide symlink');

    const tabToClose = {
      input: new vscode.TabInputText(
        vscode.Uri.file(testUnderSymlink.fileName)
      ),
    } as vscode.Tab;

    // TODO(oka): support vscode.window.tabGroups in our test double.
    const tabGroupsSpy = jasmine.createSpyObj<
      jasmine.SpyObj<typeof vscode.window.tabGroups>
    >('vscode.window.tabGroups', ['close'], {
      all: [
        {
          tabs: Object.freeze([tabToClose]),
        } as vscode.TabGroup,
      ],
    });

    state.tastTests.setVscodeWindowTabGroupsForTesting(tabGroupsSpy);

    const editors = [
      {
        document: testUnderSymlink,
      } as vscode.TextEditor,
    ];
    vscodeEmitters.window.onDidChangeVisibleTextEditors.fire(editors);

    await checkSymlinkEvents.read();

    expect(vscodeSpy.window.showWarningMessage).toHaveBeenCalledTimes(1);
    expect(tabGroupsSpy.close as jasmine.Spy).toHaveBeenCalledOnceWith([
      tabToClose,
    ]);
    expect(config.vscode.files.exclude.get()).toEqual({
      cros: true,
    });

    // Warning is not shown again for the same file.
    vscodeEmitters.window.onDidChangeVisibleTextEditors.fire(editors);
    await checkSymlinkEvents.read();
    expect(vscodeSpy.window.showWarningMessage).toHaveBeenCalledTimes(1);
  });
});
