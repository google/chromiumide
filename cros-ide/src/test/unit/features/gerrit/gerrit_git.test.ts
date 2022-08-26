// Copyright 2022 The ChromiumOS Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import 'jasmine';
import * as git from '../../../../features/gerrit/git';

const testDiffEmpty = '';

const testDiff = `
diff --git a/ide_tooling/cros-ide/src/features/gerrit.ts b/ide_tooling/cros-ide/src/features/gerrit.ts
index 511bb797b..e475e16d4 100644
--- a/ide_tooling/cros-ide/src/features/gerrit.ts
+++ b/ide_tooling/cros-ide/src/features/gerrit.ts
@@ -12 +12 @@ export function activate(context: vscode.ExtensionContext) {
-  void vscode.window.showInformationMessage('Hello GerritIntegration!!');
+  // void vscode.window.showInformationMessage('Hello GerritIntegration!!');
@@ -15,0 +16 @@ export function activate(context: vscode.ExtensionContext) {
+      console.log('active.');
@@ -19,0 +21,6 @@ export function activate(context: vscode.ExtensionContext) {
+
+  context.subscriptions.push(
+    vscode.workspace.onDidChangeTextDocument(document => {
+      void shiftCommentsOnEdit();
+    })
+  );
`;

describe('Gerrit support', () => {
  it('handles empty diffs', () => {
    const hunkrangesEmpty = git.getHunk(testDiffEmpty);
    expect(hunkrangesEmpty).toEqual([]);
  });
  it('extracts ranges of each hunt', () => {
    const hunkranges = git.getHunk(testDiff);
    expect(hunkranges).toEqual([
      {
        originalStartLine: 12,
        originalLineSize: 0,
        currentStartLine: 12,
        currentLineSize: 0,
      },
      {
        originalStartLine: 15,
        originalLineSize: 0,
        currentStartLine: 16,
        currentLineSize: 0,
      },
      {
        originalStartLine: 19,
        originalLineSize: 0,
        currentStartLine: 21,
        currentLineSize: 6,
      },
    ]);
  });
});
