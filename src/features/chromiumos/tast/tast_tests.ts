// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {getDriver} from '../../../../shared/app/common/driver_repository';
import * as config from '../../../../shared/app/services/config';
import * as services from '../../../services';
import {LazyTestController} from './lazy_test_controller';
import {SymlinkResolver} from './symlink_resolver';
import {TestCase} from './test_case';

const driver = getDriver();

/**
 * Provides tast-tests support.
 *
 * This class should be instantiated only when a file under tast-tests
 * is opened in a text editor.
 */
export class TastTests implements vscode.Disposable {
  private readonly onDidInitializeEmitter = new vscode.EventEmitter<boolean>();
  /**
   * Fires when the component is initialized with a value indicating whether the
   * initialization is successful.
   */
  readonly onDidInitialize = this.onDidInitializeEmitter.event;

  private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();
  /**
   * Fires when the test cases this component manages change.
   */
  readonly onDidChange = this.onDidChangeEmitter.event;

  readonly lazyTestController = new LazyTestController();

  private readonly subscriptions: vscode.Disposable[] = [
    this.onDidInitializeEmitter,
    this.onDidChangeEmitter,
    this.lazyTestController,
  ];

  private symlinkResolver?: SymlinkResolver;
  get onDidCheckSymlinkForTesting(): vscode.Event<void> {
    if (!this.symlinkResolver) {
      throw new Error('Internal error: symlink resolver not instantiated');
    }
    return this.symlinkResolver.onDidProcess;
  }

  // Maps URI of documents to TestCases
  private readonly visibleTestCases = new Map<string, TestCase>();
  get testCases(): TestCase[] {
    return [...this.visibleTestCases.values()];
  }

  /**
   * Constructs the class instance. `initialize` must be called on the instance for it to start
   * working.
   */
  constructor(
    private readonly chrootService: services.chromiumos.ChrootService,
    private readonly output: vscode.OutputChannel
  ) {}

  private tastTestsDir = driver.path.join(
    this.chrootService.chromiumos.root,
    'src/platform/tast-tests'
  );
  private tastDir = driver.path.join(
    this.chrootService.chromiumos.root,
    'src/platform/tast'
  );

  private static checkPrerequisiteFailed = false;
  async initialize(): Promise<void> {
    const success = await this.initializeInner();
    this.onDidInitializeEmitter.fire(success);
  }

  private async initializeInner() {
    if (TastTests.checkPrerequisiteFailed) {
      // Avoid showing the same warnings when a tast-tests file is closed and
      // then opened again.
      return false;
    }
    if (!(await this.checkPrerequisiteSatisfied())) {
      TastTests.checkPrerequisiteFailed = true;
      return false;
    }

    this.symlinkResolver = new SymlinkResolver(this.tastTestsDir, this.output);
    this.subscriptions.push(
      this.symlinkResolver,
      vscode.window.onDidChangeVisibleTextEditors(editors => {
        this.updateVisibleTestCases(editors);
      })
    );
    this.updateVisibleTestCases(vscode.window.visibleTextEditors);

    return true;
  }

  private updateVisibleTestCases(visibleEditors: readonly vscode.TextEditor[]) {
    const visibleEditorUris = new Set(
      visibleEditors.map(editor => editor.document.uri.toString())
    );

    let changed = false;

    // Remove no longer visible test cases.
    for (const [uri, testCase] of [...this.visibleTestCases.entries()]) {
      if (!visibleEditorUris.has(uri)) {
        this.visibleTestCases.delete(uri);
        testCase.dispose();
        changed = true;
      }
    }

    // Add newly visible test cases.
    for (const editor of visibleEditors) {
      const uri = editor.document.uri.toString();

      if (this.visibleTestCases.has(uri)) {
        continue;
      }

      const testCase = TestCase.maybeCreate(
        this.lazyTestController,
        editor.document
      );

      if (testCase) {
        this.visibleTestCases.set(uri, testCase);
        changed = true;
      }
    }

    if (changed) {
      this.onDidChangeEmitter.fire();
    }
  }

  private async checkPrerequisiteSatisfied(): Promise<boolean> {
    if (!(await checkGolangExtensionInstalled())) {
      return false;
    }

    if (!(await this.checkWorkspaceSetup())) {
      return false;
    }

    return await this.checkGopathSetup();
  }

  private async checkWorkspaceSetup(): Promise<boolean> {
    const foldersToAdd = this.missingWorkspaceFolders();
    if (foldersToAdd.length === 0) {
      return true;
    }

    const ADD = `Add ${foldersToAdd
      .map(x => driver.path.basename(x))
      .join(', ')}`;
    const choice = await vscode.window.showErrorMessage(
      'chromiumide: tast-tests support expects tast and tast-tests to be opend as workspace folders',
      ADD
    );
    if (choice === ADD) {
      driver.metrics.send({
        category: 'interactive',
        group: 'tast',
        name: 'tast_setup_dev_environment',
        description: 'set up dev environment',
      });
      // It will restart VSCode.
      vscode.workspace.updateWorkspaceFolders(
        /* start = */ 0,
        0,
        ...foldersToAdd.map(x => {
          return {
            uri: vscode.Uri.file(x),
          };
        })
      );
      await new Promise<void>(resolve => {
        const listener = vscode.workspace.onDidChangeWorkspaceFolders(() => {
          resolve();
          listener.dispose();
        });
      });
      return true;
    }
    return false;
  }

  /**
   * Returns missing workspace folders for tast-tests support.
   *
   * The workspace should contain both tast and tast-tests according to
   * go/tast-quickstart#ide.
   */
  private missingWorkspaceFolders(): string[] {
    const includes = (target: string) =>
      !!vscode.workspace.workspaceFolders?.find(
        folder => folder.uri.fsPath === target
      );

    const res = [];

    if (!includes(this.tastTestsDir)) {
      res.push(this.tastTestsDir);
    }
    if (!includes(this.tastDir)) {
      res.push(this.tastDir);
    }

    return res;
  }

  /**
   * Check gopath and returns true if it's valid. Otherwise it shows a pop up
   * with a button to set it up automatically and returns false.
   */
  private async checkGopathSetup(): Promise<boolean> {
    const gopath = (await vscode.commands.executeCommand(
      'go.gopath'
    )) as string;
    const gopathEntries = gopath.split(':');

    const toAdd = [];
    for (const suggested of this.suggestedGopath()) {
      if (!gopathEntries.includes(suggested)) {
        toAdd.push(suggested);
      }
    }

    if (toAdd.length === 0) {
      return true;
    }

    const newGopathEntries = [...gopathEntries, ...toAdd];

    const Update = 'Update';
    const choice = await vscode.window.showErrorMessage(
      'chromiumide: go.gopath is not properly set to provide code completion and navigation; update the workspace config?',
      Update
    );
    if (choice === Update) {
      await config.goExtension.gopath.update(newGopathEntries.join(':'));

      await vscode.commands.executeCommand('workbench.action.reloadWindow');

      return true;
    }
    return false;
  }

  /**
   * Gopath setup suggested in go/tast-quickstart#ide.
   */
  private suggestedGopath(): string[] {
    return [
      this.tastTestsDir,
      this.tastDir,
      driver.path.join(this.chrootService.chroot.root, 'usr/lib/gopath'),
    ];
  }

  dispose(): void {
    for (const testCase of this.visibleTestCases.values()) {
      testCase.dispose();
    }
    vscode.Disposable.from(...this.subscriptions.reverse()).dispose();
  }

  static resetGlobalStateForTesting(): void {
    TastTests.checkPrerequisiteFailed = false;
  }

  setVscodeWindowTabGroupsForTesting(
    tabGroups: typeof vscode.window.tabGroups
  ): void {
    this.symlinkResolver?.setVscodeWindowTabGroupsForTesting(tabGroups);
  }
}

const GOLANG_EXTENSION_ID = 'golang.Go';

/**
 * Check whether the Golang extension exists. If it doesn't exist, it show a pop
 * up with a button to install it.
 */
async function checkGolangExtensionInstalled(): Promise<boolean> {
  if (vscode.extensions.getExtension(GOLANG_EXTENSION_ID)) {
    return true;
  }

  const INSTALL = 'Install';
  const choice = await vscode.window.showErrorMessage(
    'chromiumide: Go extension is needed to enable Tast support',
    INSTALL
  );
  if (choice === INSTALL) {
    await vscode.commands.executeCommand('extension.open', GOLANG_EXTENSION_ID);
    await vscode.commands.executeCommand(
      'workbench.extensions.installExtension',
      GOLANG_EXTENSION_ID
    );
    return true;
  }

  return false;
}
