// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import * as config from '../../../../shared/app/services/config';

/** Symlinks under tast-tests directory to be resolved to the real path. */
const SYMLINKS = ['cros'];

/**
 * Gopls doesn't work on files under the `cros` -> `src/go.chromium.org/tast-tests/cros` symlink.
 *
 * This class is responsible for showing a hint if the user opens a Go file under the symlink to
 * open a real path.
 */
export class SymlinkResolver implements vscode.Disposable {
  private readonly onDidProcessEmitter = new vscode.EventEmitter<void>();
  readonly onDidProcess = this.onDidProcessEmitter.event;

  private readonly subscriptions: vscode.Disposable[] = [
    vscode.window.onDidChangeVisibleTextEditors(async editors => {
      await this.process(editors);
      this.onDidProcessEmitter.fire();
    }),
  ];

  /** URIs of the documents for which warnings are already shown. */
  private warnedDocumentUris = new Set<string>();

  private readonly symlinkMapping: Map<string, string>;

  constructor(
    tastTestsDir: string,
    private readonly output: vscode.OutputChannel
  ) {
    this.symlinkMapping = new Map<string, string>();
    for (const x of SYMLINKS) {
      const src = path.join(tastTestsDir, x);
      let dest;
      try {
        dest = path.join(tastTestsDir, fs.readlinkSync(src));
      } catch (e) {
        this.output.appendLine(`tast: Failed to read symlink ${src}: ${e}`);
        continue;
      }
      this.symlinkMapping.set(src, dest);
    }

    setImmediate(() => {
      void this.process(vscode.window.visibleTextEditors);
    });
  }

  /** This function blocks if the user ignores the warning message. */
  private async process(editors: readonly vscode.TextEditor[]) {
    if (!config.tast.showWarningForSymlink.get()) {
      return;
    }

    const toClose: vscode.TextDocument[] = [];
    const toOpen: string[] = [];

    for (const {document} of editors) {
      if (this.warnedDocumentUris.has(document.uri.toString())) {
        continue;
      }

      const fileToOpen = this.fileToOpenInstead(document);
      if (fileToOpen) {
        toClose.push(document);
        toOpen.push(fileToOpen);
      }
    }

    if (toClose.length === 0) {
      return;
    }

    // Update cache not to show the same warning for the same document twice.
    toClose.forEach(x => this.warnedDocumentUris.add(x.uri.toString()));

    const symlinksHidden = SYMLINKS.every(
      x => (config.vscode.files.exclude.get() ?? {})[x]
    );

    const choices = [
      ...(symlinksHidden ? [] : ['Yes and hide symlink']),
      'Yes',
      'Never',
    ];

    const choice = await vscode.window.showWarningMessage(
      'Tast: Go file under symlink detected; open the realpath instead for cross reference to work?',
      ...choices
    );

    let hideSymlink = false;

    switch (choice) {
      case undefined:
        return;
      case 'Yes and hide symlink':
        hideSymlink = true;
        break;
      case 'Yes':
        break;
      case 'Never':
        await config.tast.showWarningForSymlink.update(false);
        return;
    }

    await this.close(toClose);

    for (const x of toOpen) {
      await vscode.window.showTextDocument(
        await vscode.workspace.openTextDocument(x)
      );
    }

    if (!hideSymlink) return;

    const exclude = {...(config.vscode.files.exclude.get() ?? {})};
    for (const dir of SYMLINKS) {
      exclude[dir] = true;
    }
    await config.vscode.files.exclude.update(exclude);
  }

  private async close(documents: vscode.TextDocument[]) {
    const uris = new Set(documents.map(x => x.uri.toString()));

    await this.tabGroups.close(
      this.tabGroups.all
        .map(x => x.tabs)
        .flat()
        .filter(
          tab =>
            tab.input instanceof vscode.TabInputText &&
            uris.has(tab.input.uri.toString())
        )
    );
  }

  /**
   * @returns The file path to open instead if such exists.
   */
  private fileToOpenInstead(document: vscode.TextDocument): string | undefined {
    if (document.languageId !== 'go') {
      return;
    }
    for (const [src, dest] of this.symlinkMapping.entries()) {
      const relative = path.relative(src, document.fileName);
      if (!relative.startsWith('..')) {
        return path.join(dest, relative);
      }
    }
  }

  dispose(): void {
    vscode.Disposable.from(...this.subscriptions.splice(0)).dispose();
  }

  private tabGroups = vscode.window.tabGroups;

  setVscodeWindowTabGroupsForTesting(
    tabGroups: typeof vscode.window.tabGroups
  ): void {
    this.tabGroups = tabGroups;
  }
}
