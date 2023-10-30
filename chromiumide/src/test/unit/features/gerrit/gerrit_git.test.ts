// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import 'jasmine';
import {Hunk, TEST_ONLY} from '../../../../features/gerrit/git';

const {parseDiffHunks} = TEST_ONLY;

const testDiffEmpty = '';

const testDiff = `
diff --git a/ide_tooling/cros-ide/src/features/gerrit.ts b/ide_tooling/cros-ide/src/features/gerrit.ts
index 511bb797b..e475e16d4 100644
--- a/ide_tooling/cros-ide/src/features/gerrit.ts
+++ b/ide_tooling/cros-ide/src/features/gerrit.ts
@@ -2 +2 @@ export function activate(context: vscode.ExtensionContext) {
-  void vscode.window.showInformationMessage('Hello GerritIntegration!!');
+  // void vscode.window.showInformationMessage('Hello GerritIntegration!!');
@@ -3,1 +4 @@ export function activate(context: vscode.ExtensionContext) {
+      console.log('active.');
@@ -5,2 +7,3 @@ export function activate(context: vscode.ExtensionContext) {
+  context.subscriptions.push(
+      void shiftCommentsOnEdit();
+  );
diff --git a/ide_tooling/cros-ide/src/features/git.ts b/ide_tooling/cros-ide/src/features/git.ts
index 511bb797b..e475e16d4 100644
--- a/ide_tooling/cros-ide/src/features/git.ts
+++ b/ide_tooling/cros-ide/src/features/git.ts
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
      'ide_tooling/cros-ide/src/features/gerrit.ts': [
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
      'ide_tooling/cros-ide/src/features/git.ts': [
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
