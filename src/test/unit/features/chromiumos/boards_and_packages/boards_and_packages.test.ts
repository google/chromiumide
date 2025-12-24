// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import * as config from '../../../../../../shared/app/services/config';
import {BoardsAndPackages} from '../../../../../features/chromiumos/boards_and_packages';
import {CommandName} from '../../../../../features/chromiumos/boards_and_packages/command';
import {ViewItemContext} from '../../../../../features/chromiumos/boards_and_packages/constant';
import {Breadcrumbs} from '../../../../../features/chromiumos/boards_and_packages/item';
import {BoardItem} from '../../../../../features/chromiumos/boards_and_packages/item/board_item';
import {ChrootService} from '../../../../../services/chromiumos';
import * as testing from '../../../../testing';
import {FakeStatusManager, VoidOutputChannel} from '../../../../testing/fakes';
import {readPackageJson} from '../../../../testing/package_json';

describe('Boards and packages', () => {
  const {vscodeEmitters, vscodeSpy} = testing.installVscodeDouble();

  testing.installFakeConfigs(vscodeSpy, vscodeEmitters);

  const tempDir = testing.tempDir();

  const fakeExec = testing.installFakeExec();
  testing.fakes.installFakeSudo(fakeExec);

  const subscriptions: vscode.Disposable[] = [];

  afterEach(async () => {
    vscode.Disposable.from(...subscriptions.splice(0).reverse()).dispose();
    await state.onDidDispose.read();
    state.onDidDispose.dispose();
    BoardItem.clearCacheForTesting();
  });

  const state = testing.cleanState(async () => {
    vscodeSpy.window.createOutputChannel.and.returnValue(
      new VoidOutputChannel()
    );

    const chromiumosRoot = tempDir.path;

    const {chroot} = await testing.buildFakeChromeos(chromiumosRoot);

    const chrootService = ChrootService.maybeCreate(
      chromiumosRoot,
      /* setContext = */ false
    )!;

    const boardsAndPackages = new BoardsAndPackages(
      chrootService,
      new FakeStatusManager()
    );
    subscriptions.push(boardsAndPackages);

    const onDidDispose = new testing.EventReader(
      boardsAndPackages.onDidDispose
    );

    return {
      chromiumosRoot,
      chroot,
      boardsAndPackages,
      onDidDispose,
    };
  });

  it('supports revealing tree items from breadcrumbs', async () => {
    const {chromiumosRoot, chroot, boardsAndPackages} = state;

    // Prepare betty board.
    await testing.putFiles(chroot, {
      'build/betty/fake': 'x',
    });

    const treeView = boardsAndPackages.getTreeViewForTesting();
    const treeDataProvider = boardsAndPackages.getTreeDataProviderForTesting();

    // Test the tree view title.
    expect(treeView.title).toEqual('Boards and Packages');

    // Prepare cros command outputs.
    testing.fakes.installFakeCrosClient(fakeExec, {
      chromiumosRoot,
      host: {
        packages: {
          all: ['chromeos-base/codelab', 'chromeos-base/shill', 'dev-go/delve'],
          workedOn: ['chromeos-base/codelab'],
          allWorkon: ['chromeos-base/codelab', 'chromeos-base/shill'],
        },
      },
      boards: [
        {
          name: 'betty',
          packages: {
            all: [
              'chromeos-base/codelab',
              'chromeos-base/shill',
              'dev-go/delve',
            ],
            workedOn: ['chromeos-base/codelab'],
            allWorkon: ['chromeos-base/codelab', 'chromeos-base/shill'],
          },
        },
      ],
    });

    // Test existing elements can be revealed.
    await treeView.reveal(Breadcrumbs.from('host', 'chromeos-base', 'codelab'));
    await treeView.reveal(
      Breadcrumbs.from('betty', 'chromeos-base', 'codelab')
    );
    await expectAsync(
      treeView.reveal(Breadcrumbs.from('betty', 'not-exist', 'not-exist'))
    ).toBeRejected();

    // Test context values and descriptions.
    const codelab = await treeDataProvider.getTreeItem(
      Breadcrumbs.from('betty', 'chromeos-base', 'codelab')
    );
    expect(codelab.contextValue).toEqual(ViewItemContext.PACKAGE_STARTED);
    expect(codelab.description).toEqual('(workon)');

    const shill = await treeDataProvider.getTreeItem(
      Breadcrumbs.from('betty', 'chromeos-base', 'shill')
    );
    expect(shill.contextValue).toEqual(ViewItemContext.PACKAGE_STOPPED);
    const delve = await treeDataProvider.getTreeItem(
      Breadcrumbs.from('betty', 'dev-go', 'delve')
    );
    expect(delve.contextValue).toEqual(ViewItemContext.PACKAGE);
  });

  it('refreshes when default board changes', async () => {
    const {boardsAndPackages, chromiumosRoot, chroot} = state;

    // Prepare betty and kukui board.
    await testing.putFiles(chroot, {
      'build/betty/fake': 'x',
      'build/kukui/fake': 'x',
    });

    // Prepare cros command outputs.
    testing.fakes.installFakeCrosClient(fakeExec, {
      chromiumosRoot,
      boards: [
        {
          name: 'betty',
          packages: {
            all: [],
            workedOn: [],
            allWorkon: [],
          },
        },
        {
          name: 'kukui',
          packages: {
            all: [],
            workedOn: [],
            allWorkon: [],
          },
        },
      ],
    });

    const treeDataProvider = boardsAndPackages.getTreeDataProviderForTesting();

    const assertContextValue = async (
      breadcrumbs: Breadcrumbs,
      contextValue: string
    ) => {
      // Fake TreeView asynchronously refreshes the view and it doesn't provide any event to tell
      // when it finishes, hence the polling.
      await testing.flushMicrotasksUntil(
        async () =>
          (await treeDataProvider.getTreeItem(breadcrumbs)).contextValue ===
          contextValue,
        /* ms = */ 100
      );
      expect(
        (await treeDataProvider.getTreeItem(breadcrumbs)).contextValue
      ).toEqual(contextValue);
    };

    await assertContextValue(Breadcrumbs.from('betty'), ViewItemContext.BOARD);
    await assertContextValue(Breadcrumbs.from('kukui'), ViewItemContext.BOARD);

    const reader = new testing.EventReader(
      treeDataProvider.onDidChangeTreeData!,
      subscriptions
    );

    await config.board.update('betty');

    // Confirm an event to refresh the tree is fired.
    await reader.read();

    await assertContextValue(
      Breadcrumbs.from('betty'),
      ViewItemContext.BOARD_DEFAULT
    );
    await assertContextValue(Breadcrumbs.from('kukui'), ViewItemContext.BOARD);

    await config.board.update('kukui');

    await reader.read();

    await assertContextValue(Breadcrumbs.from('betty'), ViewItemContext.BOARD);
    await assertContextValue(
      Breadcrumbs.from('kukui'),
      ViewItemContext.BOARD_DEFAULT
    );
  });

  it('refreshes on workon', async () => {
    const {boardsAndPackages, chromiumosRoot} = state;

    const treeDataProvider = boardsAndPackages.getTreeDataProviderForTesting();

    // Prepare cros_sdk command handlers.
    let started = false;
    testing.fakes.installChrootCommandHandler(
      fakeExec,
      chromiumosRoot,
      'cros',
      ['workon', '--board=betty', 'start', 'chromeos-base/codelab'],
      args => {
        expect(args.length).toBe(4);
        started = true;
        return '';
      }
    );

    const reader = new testing.EventReader(
      treeDataProvider.onDidChangeTreeData!,
      subscriptions
    );

    await vscode.commands.executeCommand(
      'chromiumide.boardsAndPackages.crosWorkonStart',
      Breadcrumbs.from('betty', 'chromeos-base', 'codelab')
    );

    await reader.read();

    expect(started).toBeTrue();
  });

  it('reveals package for active file', async () => {
    const {chromiumosRoot, chroot, boardsAndPackages} = state;

    // Prepare betty board.
    await testing.putFiles(chroot, {
      'build/betty/fake': 'x',
    });

    const treeView = boardsAndPackages.getTreeViewForTesting();

    // Prepare cros command outputs.
    testing.fakes.installFakeCrosClient(fakeExec, {
      chromiumosRoot,
      host: {
        packages: {
          all: ['chromeos-base/codelab', 'chromeos-base/shill', 'dev-go/delve'],
          workedOn: ['chromeos-base/codelab'],
          allWorkon: ['chromeos-base/codelab', 'chromeos-base/shill'],
        },
      },
      boards: [
        {
          name: 'betty',
          packages: {
            all: [
              'chromeos-base/codelab',
              'chromeos-base/shill',
              'dev-go/delve',
            ],
            workedOn: ['chromeos-base/codelab'],
            allWorkon: ['chromeos-base/codelab', 'chromeos-base/shill'],
          },
        },
      ],
    });

    const textEditor = (pathFromChromiumos: string) =>
      ({
        document: new testing.fakes.FakeTextDocument({
          uri: vscode.Uri.file(path.join(chromiumosRoot, pathFromChromiumos)),
        }) as vscode.TextDocument,
      } as vscode.TextEditor);

    const codelabEbuild = textEditor(
      'src/third_party/chromiumos-overlay/chromeos-base/codelab/codelab-0.0.1-r402.ebuild'
    );

    // Nothing happens because no board has been selected.
    vscodeEmitters.window.onDidChangeActiveTextEditor.fire(codelabEbuild);

    const selectionChangeEventReader = new testing.EventReader(
      treeView.onDidChangeSelection,
      subscriptions
    );

    await treeView.reveal(Breadcrumbs.from('betty'));
    await selectionChangeEventReader.read();

    // Still nothing happens because category item hasn't been revealed yet.
    vscodeEmitters.window.onDidChangeActiveTextEditor.fire(codelabEbuild);

    expect(treeView.selection).toEqual([Breadcrumbs.from('betty')]);

    await treeView.reveal(Breadcrumbs.from('betty', 'chromeos-base'));
    expect(treeView.selection).toEqual([
      Breadcrumbs.from('betty', 'chromeos-base'),
    ]);
    await selectionChangeEventReader.read();

    // Now the codelab package should be selected.
    vscodeEmitters.window.onDidChangeActiveTextEditor.fire(codelabEbuild);
    await selectionChangeEventReader.read();
    expect(treeView.selection).toEqual([
      Breadcrumbs.from('betty', 'chromeos-base', 'codelab'),
    ]);

    // Emulate user's manually selecting another item.
    await treeView.reveal(Breadcrumbs.from('betty', 'dev-go', 'delve'));
    await selectionChangeEventReader.read();
    expect(treeView.selection).toEqual([
      Breadcrumbs.from('betty', 'dev-go', 'delve'),
    ]);

    // Changing the active text editor, the selection comes back to codelab.
    vscodeEmitters.window.onDidChangeActiveTextEditor.fire(codelabEbuild);
    await selectionChangeEventReader.read();
    expect(treeView.selection).toEqual([
      Breadcrumbs.from('betty', 'chromeos-base', 'codelab'),
    ]);

    // Change the selection to host.
    await treeView.reveal(Breadcrumbs.from('host', 'chromeos-base'));
    await selectionChangeEventReader.read();
    expect(treeView.selection).toEqual([
      Breadcrumbs.from('host', 'chromeos-base'),
    ]);

    // Codelab under host should be selected now.
    vscodeEmitters.window.onDidChangeActiveTextEditor.fire(codelabEbuild);
    await selectionChangeEventReader.read();
    expect(treeView.selection).toEqual([
      Breadcrumbs.from('host', 'chromeos-base', 'codelab'),
    ]);
  });

  it('favorite categories shown first', async () => {
    const {chromiumosRoot, boardsAndPackages} = state;

    const treeDataProvider = boardsAndPackages.getTreeDataProviderForTesting();

    testing.fakes.installFakeCrosClient(fakeExec, {
      chromiumosRoot,
      host: {
        packages: {
          all: ['a/x', 'b/x', 'c/x'],
          workedOn: [],
          allWorkon: [],
        },
      },
      boards: [],
    });

    const host = Breadcrumbs.from('host');
    const a = Breadcrumbs.from('host', 'a');
    const b = Breadcrumbs.from('host', 'b');
    const c = Breadcrumbs.from('host', 'c');

    expect(await treeDataProvider.getChildren(undefined)).toEqual([host]);

    // Lexicographically sorted by default.
    expect(await treeDataProvider.getChildren(host)).toEqual([a, b, c]);

    await vscode.commands.executeCommand(
      'chromiumide.boardsAndPackages.favoriteAdd',
      b
    );

    expect(await treeDataProvider.getChildren(host)).toEqual([b, a, c]);

    await vscode.commands.executeCommand(
      'chromiumide.boardsAndPackages.favoriteAdd',
      c
    );

    expect(await treeDataProvider.getChildren(host)).toEqual([b, c, a]);

    await vscode.commands.executeCommand(
      'chromiumide.boardsAndPackages.favoriteDelete',
      b
    );

    expect(await treeDataProvider.getChildren(host)).toEqual([c, a, b]);

    await config.boardsAndPackages.favoriteCategories.update(['a', 'c']);

    expect(await treeDataProvider.getChildren(host)).toEqual([a, c, b]);
  });

  it('sorts packages by favorite and workon status', async () => {
    vscodeSpy.window.showErrorMessage.and.callFake(async (message: unknown) =>
      fail(message)
    );

    const {chromiumosRoot, boardsAndPackages} = state;

    const treeView = boardsAndPackages.getTreeViewForTesting();
    const treeDataProvider = boardsAndPackages.getTreeDataProviderForTesting();

    testing.fakes.installFakeCrosClient(fakeExec, {
      chromiumosRoot,
      host: {
        packages: {
          all: ['x/a', 'x/b', 'x/c', 'x/w'],
          workedOn: ['x/w'],
          allWorkon: ['x/c', 'x/w'],
        },
      },
      boards: [],
    });

    const x = Breadcrumbs.from('host', 'x');
    const a = Breadcrumbs.from('host', 'x', 'a');
    const b = Breadcrumbs.from('host', 'x', 'b');
    const c = Breadcrumbs.from('host', 'x', 'c');
    const w = Breadcrumbs.from('host', 'x', 'w');

    await treeView.reveal(a);
    await treeView.reveal(b);
    await treeView.reveal(c);
    expect(treeView.selection).toEqual([c]);

    const equals = (a: Breadcrumbs[], b: Breadcrumbs[]) => {
      return a.length === b.length && a.every((x, i) => x === b[i]);
    };
    const expectPackages = async (want: Breadcrumbs[]) => {
      await testing.flushMicrotasksUntil(
        async () => equals((await treeDataProvider.getChildren(x))!, want),
        1000
      );
      expect(await treeDataProvider.getChildren(x)).toEqual(want);
    };

    // Lexicographically sorted by default except workon-started pacakegs are shown first.
    await expectPackages([w, a, b, c]);

    await vscode.commands.executeCommand(
      'chromiumide.boardsAndPackages.favoriteAdd',
      b
    );

    await expectPackages([b, w, a, c]);

    await vscode.commands.executeCommand(
      'chromiumide.boardsAndPackages.favoriteAdd',
      c
    );

    await expectPackages([b, c, w, a]);

    await vscode.commands.executeCommand(
      'chromiumide.boardsAndPackages.favoriteDelete',
      b
    );

    await expectPackages([c, w, a, b]);

    await config.boardsAndPackages.favoritePackages.update(['x/b', 'x/w']);

    await expectPackages([w, b, a, c]);
  });

  it('context menus are shown conditionally per context', () => {
    const packageJson = readPackageJson();

    const generateCoverage = 'chromiumide.coverage.generate';
    for (const [command, contextValue, wantShown] of [
      // generate coverage
      [generateCoverage, ViewItemContext.CATEGORY, false],
      [generateCoverage, ViewItemContext.PACKAGE, true],
      [generateCoverage, ViewItemContext.PACKAGE_STARTED_FAVORITE, true],
      // build commands
      [CommandName.BUILD, ViewItemContext.CATEGORY, false],
      [CommandName.BUILD, ViewItemContext.PACKAGE, true],
      // workon start/stop commands
      [CommandName.CROS_WORKON_START, ViewItemContext.PACKAGE_STOPPED, true],
      [
        CommandName.CROS_WORKON_START,
        ViewItemContext.PACKAGE_STOPPED_FAVORITE,
        true,
      ],
      [CommandName.CROS_WORKON_START, ViewItemContext.PACKAGE_STARTED, false],
      [CommandName.CROS_WORKON_START, ViewItemContext.PACKAGE, false],
      [CommandName.CROS_WORKON_STOP, ViewItemContext.PACKAGE_STARTED, true],
      [
        CommandName.CROS_WORKON_STOP,
        ViewItemContext.PACKAGE_STARTED_FAVORITE,
        true,
      ],
      [CommandName.CROS_WORKON_STOP, ViewItemContext.PACKAGE_STOPPED, false],
      [CommandName.CROS_WORKON_STOP, ViewItemContext.PACKAGE, false],
      // add/delete favorite commands
      [CommandName.FAVORITE_ADD, ViewItemContext.BOARD, false],
      [CommandName.FAVORITE_ADD, ViewItemContext.PACKAGE, true],
      [CommandName.FAVORITE_ADD, ViewItemContext.PACKAGE_FAVORITE, false],
      [CommandName.FAVORITE_ADD, ViewItemContext.CATEGORY, true],
      [CommandName.FAVORITE_ADD, ViewItemContext.CATEGORY_FAVORITE, false],
      [CommandName.FAVORITE_DELETE, ViewItemContext.BOARD, false],
      [CommandName.FAVORITE_DELETE, ViewItemContext.PACKAGE, false],
      [CommandName.FAVORITE_DELETE, ViewItemContext.PACKAGE_FAVORITE, true],
      [CommandName.FAVORITE_DELETE, ViewItemContext.CATEGORY, false],
      [CommandName.FAVORITE_DELETE, ViewItemContext.CATEGORY_FAVORITE, true],
      // open ebuild
      [CommandName.OPEN_EBUILD, ViewItemContext.PACKAGE, true],
      [CommandName.OPEN_EBUILD, ViewItemContext.PACKAGE_FAVORITE, true],
      [CommandName.OPEN_EBUILD, ViewItemContext.PACKAGE_STARTED, true],
      [CommandName.OPEN_EBUILD, ViewItemContext.CATEGORY, false],
      // set default board
      [CommandName.SET_DEFAULT_BOARD, ViewItemContext.BOARD, true],
      [CommandName.SET_DEFAULT_BOARD, ViewItemContext.BOARD_HOST, false],
      [CommandName.SET_DEFAULT_BOARD, ViewItemContext.BOARD_DEFAULT, false],
      [CommandName.SET_DEFAULT_BOARD, ViewItemContext.CATEGORY, false],
    ] as const)
      expect(
        testing.evaluateWhenClause(
          packageJson.contributes.menus['view/item/context'].find(
            x => x.command === command
          )!.when,
          {
            'config.chromiumide.testCoverage.enabled': true,
            view: 'boards-and-packages',
            viewItem: contextValue,
          }
        )
      )
        .withContext(`command ${command} under context ${contextValue}`)
        .toEqual(wantShown);
  });

  it('offers command to build the package', async () => {
    let built = false;
    testing.fakes.installChrootCommandHandler(
      fakeExec,
      state.chromiumosRoot,
      'emerge-betty',
      ['chromeos-base/codelab', '--jobs', `${os.cpus().length}`],
      () => {
        built = true;
        return '';
      }
    );

    await vscode.commands.executeCommand(
      'chromiumide.boardsAndPackages.build',
      Breadcrumbs.from('betty', 'chromeos-base', 'codelab')
    );

    expect(built).toBeTrue();
    expect(vscodeSpy.window.showInformationMessage).toHaveBeenCalledOnceWith(
      'chromeos-base/codelab has been built for betty'
    );
  });

  it('offers command to build the package with flags', async () => {
    let built = false;
    testing.fakes.installChrootCommandHandler(
      fakeExec,
      state.chromiumosRoot,
      'env',
      [
        'FEATURES=nostrip',
        'emerge-betty',
        'chromeos-base/codelab',
        '--jobs',
        `${os.cpus().length}`,
      ],
      () => {
        built = true;
        return '';
      }
    );

    const picker = new testing.fakes.FakeQuickPick();
    vscodeSpy.window.createQuickPick.and.returnValue(picker);

    const command = vscode.commands.executeCommand(
      'chromiumide.boardsAndPackages.buildWithFlags',
      Breadcrumbs.from('betty', 'chromeos-base', 'codelab')
    );

    picker.activeItems = [{label: 'FEATURES=nostrip'}];
    picker.accept();

    await command;

    expect(built).toBeTrue();
    expect(vscodeSpy.window.showInformationMessage).toHaveBeenCalledOnceWith(
      'chromeos-base/codelab has been built for betty'
    );
  });

  it('offers command to build packages', async () => {
    const terminal = new testing.fakes.FakeTerminal();
    vscodeSpy.window.createTerminal.and.returnValue(terminal);

    await vscode.commands.executeCommand(
      'chromiumide.boardsAndPackages.buildPackages',
      Breadcrumbs.from('brya')
    );

    terminal.close({code: 0, reason: vscode.TerminalExitReason.User});

    expect(terminal.getTexts()).toEqual('cros build-packages --board brya\n');
  });

  it('offers command to build image', async () => {
    vscodeSpy.window.showQuickPick.and.returnValue({
      label: 'test',
    });

    const terminal = new testing.fakes.FakeTerminal();
    vscodeSpy.window.createTerminal.and.returnValue(terminal);

    await vscode.commands.executeCommand(
      'chromiumide.boardsAndPackages.buildImage',
      Breadcrumbs.from('brya')
    );

    terminal.close({code: 0, reason: vscode.TerminalExitReason.User});

    expect(terminal.getTexts()).toEqual('cros build-image --board brya test\n');
  });
});
