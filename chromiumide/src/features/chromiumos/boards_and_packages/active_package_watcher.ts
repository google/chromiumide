// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {
  ParsedEbuildFilepath,
  ParsedPackageName,
} from '../../../common/chromiumos/portage/ebuild';
import {ChrootService, Packages} from '../../../services/chromiumos';

/**
 * Watches active text editor and tracks the package correspnoding to the active file. It fires an
 * event when the active file is changed and there's a package correspnoding to the active file.
 * i.e. it fires an event even if the package for the active file doesn't change.
 */
export class ActivePackageWatcher implements vscode.Disposable {
  private readonly onDidChangeActiveFileEmitter = new vscode.EventEmitter<
    ParsedPackageName | undefined
  >();
  readonly onDidChangeActiveFile = this.onDidChangeActiveFileEmitter.event;

  private readonly subscriptions: vscode.Disposable[] = [
    this.onDidChangeActiveFileEmitter,
  ];

  private readonly packages: Packages;

  private pkg: ParsedPackageName | undefined = undefined;

  get value(): ParsedPackageName | undefined {
    return this.pkg;
  }

  constructor(chrootService: ChrootService) {
    this.packages = Packages.getOrCreate(chrootService);

    this.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor(e =>
        this.onDidChangeActiveTextEditor(e)
      )
    );

    void this.onDidChangeActiveTextEditor(vscode.window.activeTextEditor);
  }

  private async onDidChangeActiveTextEditor(
    textEditor: vscode.TextEditor | undefined
  ): Promise<void> {
    if (!textEditor) {
      return;
    }
    const pkg = await this.getPackage(textEditor);

    this.pkg = pkg;
    this.onDidChangeActiveFileEmitter.fire(pkg);
  }

  private async getPackage(
    textEditor: vscode.TextEditor
  ): Promise<ParsedPackageName | undefined> {
    const filepath = textEditor.document.fileName;

    const packageInfo = await this.packages.fromFilepath(filepath);
    if (packageInfo) {
      return packageInfo.pkg;
    }

    if (filepath.endsWith('.ebuild')) {
      try {
        return ParsedEbuildFilepath.parseOrThrow(filepath).pkg;
      } catch (e) {
        // Ignore
      }
    }

    return undefined;
  }

  dispose(): void {
    vscode.Disposable.from(...this.subscriptions.reverse()).dispose();
  }
}
