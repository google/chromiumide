// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import 'jasmine';
import * as path from 'path';
import * as vscode from 'vscode';
import {ProductWatcher} from '../../../../../services';
import * as testing from '../../../../testing';
import {buildFakeChromium} from '../../../../testing/fs';

const PUBLIC_MANIFEST = `[core]
\trepositoryformatversion = 0
\tfilemode = true
[filter "lfs"]
\tsmudge = git-lfs smudge --skip -- %f
\tprocess = git-lfs filter-process --skip
[remote "origin"]
\turl = https://chromium.googlesource.com/chromiumos/manifest
\tfetch = +refs/heads/*:refs/remotes/origin/*
[manifest]
\tplatform = auto
[branch "default"]
\tremote = origin
\tmerge = refs/heads/main
`;

const INTERNAL_MANIFEST = `[core]
\trepositoryformatversion = 0
\tfilemode = true
[filter "lfs"]
\tsmudge = git-lfs smudge --skip -- %f
\tprocess = git-lfs filter-process --skip
[remote "origin"]
\turl = https://chrome-internal.googlesource.com/chromeos/manifest-internal
\tfetch = +refs/heads/*:refs/remotes/origin/*
[manifest]
\tplatform = auto
`;

const INTERNAL_MANIFEST_WITH_DOT_GIT = `[core]
\trepositoryformatversion = 0
\tfilemode = true
[filter "lfs"]
\tsmudge = git-lfs smudge --skip -- %f
\tprocess = git-lfs filter-process --skip
[remote "origin"]
\turl = https://chrome-internal.googlesource.com/chromeos/manifest-internal.git
\tfetch = +refs/heads/*:refs/remotes/origin/*
[manifest]
\tplatform = auto
`;

async function repoInit(root: string, manifestConfig: string) {
  await testing.putFiles(root, {
    '.repo/manifests.git/config': manifestConfig,
  });
}

function workspaceFolder(fsPath: string): vscode.WorkspaceFolder {
  return {uri: vscode.Uri.file(fsPath)} as vscode.WorkspaceFolder;
}

describe('Chromiumos product watcher', () => {
  const tempDir = testing.tempDir();

  const {vscodeEmitters, vscodeSpy} = testing.installVscodeDouble();
  testing.installFakeConfigs(vscodeSpy, vscodeEmitters);

  const subscriptions: vscode.Disposable[] = [];
  let watcher: ProductWatcher;
  beforeEach(() => {
    watcher = new ProductWatcher('chromiumos');
    subscriptions.push(watcher);
  });
  afterEach(() => {
    vscode.Disposable.from(...subscriptions.reverse()).dispose();
    subscriptions.splice(0);
  });

  for (const [name, manifest] of [
    ['fires event for Chromiumos', PUBLIC_MANIFEST],
    ['fires event for internal Chromeos', INTERNAL_MANIFEST],
    [
      'fires event for internal Chromeos with .git',
      INTERNAL_MANIFEST_WITH_DOT_GIT,
    ],
  ]) {
    it(name, async () => {
      await repoInit(tempDir.path, manifest);

      const root = new Promise(resolve => {
        subscriptions.push(
          watcher.onDidChangeRoot(root => {
            resolve(root);
          })
        );
      });

      const folder = path.join(tempDir.path, 'foo/bar');
      vscodeEmitters.workspace.onDidChangeWorkspaceFolders.fire({
        added: [workspaceFolder(folder)],
        removed: [],
      });

      expect(await root).toEqual(tempDir.path);
    });
  }

  it('fires event on right timing', async () => {
    const cros1 = path.join(tempDir.path, 'cros1');
    const cros2 = path.join(tempDir.path, 'cros2');

    await repoInit(cros1, PUBLIC_MANIFEST);
    await repoInit(cros2, PUBLIC_MANIFEST);

    const eventReader = new testing.EventReader(watcher.onDidChangeRoot);
    subscriptions.push(eventReader);

    vscodeEmitters.workspace.onDidChangeWorkspaceFolders.fire({
      added: [workspaceFolder(cros1)],
      removed: [],
    });

    expect(await eventReader.read()).toEqual(cros1);

    vscodeEmitters.workspace.onDidChangeWorkspaceFolders.fire({
      added: [workspaceFolder(cros2)],
      removed: [workspaceFolder(cros1)],
    });

    expect(await eventReader.read()).toEqual(cros2);

    vscodeEmitters.workspace.onDidChangeWorkspaceFolders.fire({
      added: [],
      removed: [workspaceFolder(cros2)],
    });

    expect(await eventReader.read()).toBeUndefined();
  });

  it('navigates user to open a workspace folder', async () => {
    const cros = path.join(tempDir.path, 'cros');
    const chromite = path.join(cros, 'chromite');

    await repoInit(cros, PUBLIC_MANIFEST);

    const git = new testing.Git(chromite);
    await git.init();
    await git.commit('init');

    const chromiteFoo = path.join(chromite, 'foo.cc');

    vscodeSpy.window.showErrorMessage.and.resolveTo('Open chromite');

    vscodeEmitters.workspace.onDidOpenTextDocument.fire({
      uri: vscode.Uri.file(chromiteFoo),
      fileName: chromiteFoo,
    } as vscode.TextDocument);

    await new Promise<void>(resolve => {
      vscodeSpy.commands.executeCommand.and.callFake(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (command: string, ...rest: any[]): Promise<any> => {
          expect(command).toEqual('vscode.openFolder');
          expect(rest[0]).toEqual(vscode.Uri.file(chromite));

          resolve();
        }
      );
    });

    expect(vscodeSpy.window.showErrorMessage.calls.argsFor(0)).toEqual([
      'ChromiumIDE expects a workspace folder with chromiumos sources',
      'Open chromite',
      'Open Other',
    ]);
  });
});

describe('Chromium product watcher', () => {
  const tempDir = testing.tempDir();

  const {vscodeEmitters} = testing.installVscodeDouble();

  const subscriptions: vscode.Disposable[] = [];
  let watcher: ProductWatcher;
  beforeEach(() => {
    watcher = new ProductWatcher('chromium');
    subscriptions.push(watcher);
  });
  afterEach(() => {
    vscode.Disposable.from(...subscriptions.reverse()).dispose();
    subscriptions.splice(0);
  });

  it('fires event on Chromium', async () => {
    const chromium = path.join(tempDir.path, 'chromium');

    await buildFakeChromium(chromium);

    const events = new testing.EventReader(watcher.onDidChangeRoot);
    subscriptions.push(events);

    const irrelevantFolder = path.join(tempDir.path, 'foo/bar');
    const chromiumFolder = path.join(chromium, 'src');

    vscodeEmitters.workspace.onDidChangeWorkspaceFolders.fire({
      added: [workspaceFolder(irrelevantFolder)],
      removed: [],
    });
    vscodeEmitters.workspace.onDidChangeWorkspaceFolders.fire({
      added: [
        workspaceFolder(irrelevantFolder),
        workspaceFolder(chromiumFolder),
      ],
      removed: [],
    });

    expect(await events.read()).toEqual(chromium);
  });
});
