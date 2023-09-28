// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {Metrics} from '../features/metrics/metrics';
import * as ideUtil from '../ide_util';

export function activate(context: vscode.ExtensionContext): void {
  const recommendations: Recommendation[] = [
    {
      languageIds: ['cpp', 'c'],
      extensionId: 'llvm-vs-code-extensions.vscode-clangd',
      message:
        'Clangd extension provides cross references and autocompletion in C/C++. ' +
        'Would you like to install it?',
      availableForCodeServer: true,
    },
    {
      languageIds: ['gn'],
      extensionId: 'msedge-dev.gnls',
      message:
        'GN Language Server extension provides syntax highlighting and code navigation for GN build files. ' +
        'Would you like to install it?',
      availableForCodeServer: false,
    },
    {
      languageIds: ['go'],
      extensionId: 'golang.Go',
      message:
        'Go extension provides rich language support for the Go programming language. ' +
        'Would you like to install it?',
      availableForCodeServer: true,
      suggestOnlyInCodeServer: true,
    },
    {
      languageIds: ['sepolicy'],
      extensionId: 'google.selinux-policy-languages',
      message:
        'SELinux Policy provides syntax highlighting for the SELinux kernel ' +
        'policy language and Common Intermediate Language. Would you like to install it?',
      availableForCodeServer: false,
    },
    {
      languageIds: ['starlark'],
      extensionId: 'bazelbuild.vscode-bazel',
      message:
        'Bazel plugin provides syntax highlighting for Starlark files. ' +
        'Would you like to install it?',
      availableForCodeServer: true,
    },
  ];

  const isCodeServer = ideUtil.isCodeServer();
  for (const recommendation of recommendations) {
    context.subscriptions.push(new Recommender(recommendation, isCodeServer));
  }
}

interface Recommendation {
  languageIds: string[];
  extensionId: string;
  message: string;

  // Whether the recommended extension is available for both the regular VS Code and
  // code-server. It is assumed that the former is a superset of the latter.
  availableForCodeServer: boolean;

  suggestOnlyInCodeServer?: boolean;
}
/**
 * Registers a recommendation.
 *
 * @returns Disposable which should be called on deactivation.
 */
export function activateSingle(
  recommendation: Recommendation,
  isCodeServer: boolean
): vscode.Disposable {
  return new Recommender(recommendation, isCodeServer);
}

const YES = 'Yes';
const LATER = 'Later';

class Recommender implements vscode.Disposable {
  private readonly subscriptions: vscode.Disposable[] = [];
  private suggested = false;

  constructor(
    private readonly recommendation: Recommendation,
    private readonly isCodeServer: boolean
  ) {
    this.trySuggest(vscode.window.activeTextEditor);
    vscode.window.onDidChangeActiveTextEditor(editor => {
      this.trySuggest(editor);
    });
  }

  dispose(): void {
    vscode.Disposable.from(...this.subscriptions).dispose();
  }

  private trySuggest(editor: vscode.TextEditor | undefined): void {
    // Do not show the same suggestion twice in a lifetime of the extension.
    if (this.suggested) {
      return;
    }

    // Do not suggest an extension if it is unavailable for the current environment.
    if (this.isCodeServer && !this.recommendation.availableForCodeServer) {
      return;
    }

    if (this.recommendation.suggestOnlyInCodeServer && !this.isCodeServer) {
      return;
    }

    // Suggest only when the language ID matches.
    if (
      !editor ||
      !this.recommendation.languageIds.includes(editor.document.languageId)
    ) {
      return;
    }

    // Do not suggest an already installed extension.
    if (vscode.extensions.getExtension(this.recommendation.extensionId)) {
      return;
    }

    // Show a suggestion asynchronously.
    void (async () => {
      const choice = await vscode.window.showInformationMessage(
        this.recommendation.message,
        YES,
        LATER
      );
      Metrics.send({
        category: 'background',
        group: 'misc',
        description: 'show suggestion',
        name: 'misc_suggested_extension',
        extension: this.recommendation.extensionId,
      });
      if (choice === YES) {
        await vscode.commands.executeCommand(
          'extension.open',
          this.recommendation.extensionId
        );
        await vscode.commands.executeCommand(
          'workbench.extensions.installExtension',
          this.recommendation.extensionId
        );
        Metrics.send({
          category: 'interactive',
          group: 'misc',
          description: 'install suggested',
          name: 'misc_installed_suggested_extension',
          extension: this.recommendation.extensionId,
        });
      }
    })();

    this.suggested = true;
  }
}
