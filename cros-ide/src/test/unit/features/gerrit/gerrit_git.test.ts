// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import 'jasmine';
import {Hunk, TEST_ONLY} from '../../../../features/gerrit/git';

const {parseDiffHunksMap} = TEST_ONLY;

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

describe('Gerrit support', () => {
  it('handles empty diffs', () => {
    const hunkRangesEmpty = parseDiffHunksMap(testDiffEmpty);
    expect(hunkRangesEmpty).toEqual({});
  });
  it('extracts ranges of each hunk', () => {
    const hunkRanges = parseDiffHunksMap(testDiff);
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
});
