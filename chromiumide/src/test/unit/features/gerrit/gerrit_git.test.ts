// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import 'jasmine';
import * as vscode from 'vscode';
import {Hunk, TEST_ONLY, getRepoId} from '../../../../features/gerrit/git';
import {Sink} from '../../../../features/gerrit/sink';
import * as testing from '../../../testing';
import {FakeStatusManager} from '../../../testing/fakes';

const {parseDiffHunks} = TEST_ONLY;

const testDiffEmpty = '';

const testDiff = `
diff --git a/chromiumide/src/features/gerrit.ts b/chromiumide/src/features/gerrit.ts
index 511bb797b..e475e16d4 100644
--- a/chromiumide/src/features/gerrit.ts
+++ b/chromiumide/src/features/gerrit.ts
@@ -2 +2 @@ export function activate(context: vscode.ExtensionContext) {
-  void vscode.window.showInformationMessage('Hello GerritIntegration!!');
+  // void vscode.window.showInformationMessage('Hello GerritIntegration!!');
@@ -3,1 +4 @@ export function activate(context: vscode.ExtensionContext) {
+      console.log('active.');
@@ -5,2 +7,3 @@ export function activate(context: vscode.ExtensionContext) {
+  context.subscriptions.push(
+      void shiftCommentsOnEdit();
+  );
diff --git a/chromiumide/src/features/git.ts b/chromiumide/src/features/git.ts
index 511bb797b..e475e16d4 100644
--- a/chromiumide/src/features/git.ts
+++ b/chromiumide/src/features/git.ts
@@ -3 +3 @@ export function activate(context: vscode.ExtensionContext) {
-  void vscode.window.showInformationMessage('Hello GerritIntegration!!');
+  // void vscode.window.showInformationMessage('Hello GerritIntegration!!');
@@ -4,1 +5 @@ export function activate(context: vscode.ExtensionContext) {
+      console.log('active.');
@@ -6,2 +8,3 @@ export function activate(context: vscode.ExtensionContext) {
+  context.subscriptions.push(
+      void shiftCommentsOnEdit();
+  );

`;

const testDiffNewFile = `diff --git a/new2.txt b/new2.txt
new file mode 100644
index 0000000000..0cfbf08886
--- /dev/null
+++ b/new2.txt
@@ -0,0 +1 @@
+2
`;

describe('Gerrit support', () => {
  it('handles empty diffs', () => {
    const hunkRangesEmpty = parseDiffHunks(testDiffEmpty);
    expect(hunkRangesEmpty).toEqual({});
  });

  it('extracts ranges of each hunk', () => {
    const hunkRanges = parseDiffHunks(testDiff);
    expect(hunkRanges).toEqual({
      'chromiumide/src/features/gerrit.ts': [
        Hunk.of({
          originalStart: 2,
          originalSize: 1,
          currentStart: 2,
          currentSize: 1,
        }),
        Hunk.of({
          originalStart: 3,
          originalSize: 1,
          currentStart: 4,
          currentSize: 1,
        }),
        Hunk.of({
          originalStart: 5,
          originalSize: 2,
          currentStart: 7,
          currentSize: 3,
        }),
      ],
      'chromiumide/src/features/git.ts': [
        Hunk.of({
          originalStart: 3,
          originalSize: 1,
          currentStart: 3,
          currentSize: 1,
        }),
        Hunk.of({
          originalStart: 4,
          originalSize: 1,
          currentStart: 5,
          currentSize: 1,
        }),
        Hunk.of({
          originalStart: 6,
          originalSize: 2,
          currentStart: 8,
          currentSize: 3,
        }),
      ],
    });
  });

  it('handles new files', () => {
    const hunkRanges = parseDiffHunks(testDiffNewFile);
    expect(hunkRanges).toEqual({
      'new2.txt': [
        Hunk.of({
          originalStart: 0,
          originalSize: 0,
          currentStart: 1,
          currentSize: 1,
        }),
      ],
    });
  });

  it('handles removed files', () => {
    const hunkRanges = parseDiffHunks(`diff --git a/a.txt b/a.txt
deleted file mode 100644
index 7898192..0000000
--- a/a.txt
+++ /dev/null
@@ -1 +0,0 @@
-a
`);
    expect(hunkRanges).toEqual({
      'a.txt': [
        Hunk.of({
          originalStart: 1,
          originalSize: 1,
          currentStart: 0,
          currentSize: 0,
        }),
      ],
    });
  });
});

describe('RepoId calculation', () => {
  const tempDir = testing.tempDir();

  const subscriptions: vscode.Disposable[] = [];
  afterEach(() => {
    vscode.Disposable.from(...subscriptions.reverse()).dispose();
    subscriptions.length = 0;
  });

  (['chromium', 'cros', 'cros-internal'] as const).forEach(wantRepoId => {
    it(`calculates repo id for ${wantRepoId} correctly`, async () => {
      const git = new testing.Git(tempDir.path);
      await git.init({repoId: wantRepoId});

      const sink = new Sink(new FakeStatusManager(), subscriptions);
      const repoId = await getRepoId(git.root, sink);
      expect(repoId).toEqual(wantRepoId);
    });
  });

  (
    [
      {name: 'no remotes', remotes: [], wantRepoId: undefined},
      {
        name: 'chromium remote',
        remotes: [
          {
            name: 'origin',
            url: 'https://chromium.googlesource.com/chromium/src.git',
          },
        ],
        wantRepoId: 'chromium',
      },
      {
        name: 'chromium remote with /a/',
        remotes: [
          {
            name: 'origin',
            url: 'https://chromium.googlesource.com/a/chromium/src.git',
          },
        ],
        wantRepoId: 'chromium',
      },
      {
        name: 'unknown remote',
        remotes: [
          {
            name: 'origin',
            url: 'https://chromium.googlesource.com/src.git',
          },
        ],
        wantRepoId: undefined,
      },
      {
        name: 'cros remote',
        remotes: [
          {
            name: 'cros',
            url: 'https://chromium.googlesource.com/chromiumos/chromite.git',
          },
        ],
        wantRepoId: 'cros',
      },
      {
        name: 'cros-internal remote',
        remotes: [
          {
            name: 'cros-internal',
            url: 'https://chrome-internal.googlesource.com/chromiumos/chromite.git',
          },
        ],
        wantRepoId: 'cros-internal',
      },
      {
        name: 'ignores unknown remotes',
        remotes: [
          {
            name: 'github',
            url: 'git@github.com:foo/chromium.git',
          },
          {
            name: 'origin',
            url: 'https://chromium.googlesource.com/chromium/src.git',
          },
        ],
        wantRepoId: 'chromium',
      },
    ] as const
  ).forEach(({remotes, wantRepoId, name}) => {
    it(`calculates repo id correctly: ${name}`, async () => {
      const git = new testing.Git(tempDir.path);
      await git.init({repoId: null});
      for (const {name, url} of remotes) {
        await git.addRemote(name, url);
      }

      const sink = new Sink(new FakeStatusManager(), subscriptions);
      const repoId = await getRepoId(git.root, sink);
      expect(repoId).toEqual(wantRepoId);
    });
  });

  it('ignores other remotes the user has in addition to the canonical remotes', async () => {
    const git = new testing.Git(tempDir.path);
    await git.init({repoId: null});
    await git.addRemote('github', 'git@github.com:foo/chromium.git');
    await git.addRemote(
      'origin',
      'https://chromium.googlesource.com/chromium/src.git'
    );

    const sink = new Sink(new FakeStatusManager(), subscriptions);
    const repoId = await getRepoId(git.root, sink);
    expect(repoId).toEqual('chromium');
  });
});
