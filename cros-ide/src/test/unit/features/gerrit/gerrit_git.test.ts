// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import 'jasmine';
import {TEST_ONLY} from '../../../../features/gerrit/git';

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

describe('Gerrit support', () => {
  it('handles empty diffs', () => {
    const hunkRangesEmpty = parseDiffHunks(testDiffEmpty);
    expect(hunkRangesEmpty).toEqual({});
  });
  it('extracts ranges of each hunk', () => {
    const hunkRanges = parseDiffHunks(testDiff);
    expect(hunkRanges).toEqual({
      'ide_tooling/cros-ide/src/features/gerrit.ts': [
        {
          originalStartLine: 2,
          originalLineSize: 1,
          currentStartLine: 2,
          currentLineSize: 1,
        },
        {
          originalStartLine: 3,
          originalLineSize: 1,
          currentStartLine: 4,
          currentLineSize: 1,
        },
        {
          originalStartLine: 5,
          originalLineSize: 2,
          currentStartLine: 7,
          currentLineSize: 3,
        },
      ],
      'ide_tooling/cros-ide/src/features/git.ts': [
        {
          originalStartLine: 3,
          originalLineSize: 1,
          currentStartLine: 3,
          currentLineSize: 1,
        },
        {
          originalStartLine: 4,
          originalLineSize: 1,
          currentStartLine: 5,
          currentLineSize: 1,
        },
        {
          originalStartLine: 6,
          originalLineSize: 2,
          currentStartLine: 8,
          currentLineSize: 3,
        },
      ],
    });
  });
});
