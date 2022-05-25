// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {cleanState} from './testing';

/**
 * Spy for the `vscode` module.
 */
export type VscodeSpy = ReturnType<typeof newVscodeSpy>;

type SpiableVscodeWindow = Omit<
  typeof vscode.window,
  'showInformationMessage'
> & {
  // Original type doesn't work due to
  // https://github.com/DefinitelyTyped/DefinitelyTyped/issues/42455 .
  showErrorMessage: jasmine.Func;
  showInformationMessage: jasmine.Func;
  showQuickPick: jasmine.Func;
  showWarningMessage: jasmine.Func;
};

/**
 * Creates a new VscodeSpy.
 * The fields should be substituted in installVscodeDouble().
 */
function newVscodeSpy() {
  return {
    commands: jasmine.createSpyObj<typeof vscode.commands>('vscode.commands', [
      'registerCommand',
      'registerTextEditorCommand',
      'executeCommand',
    ]),
    env: jasmine.createSpyObj<typeof vscode.env>('vscode.env', [
      'openExternal',
    ]),
    window: jasmine.createSpyObj<SpiableVscodeWindow>('vscode.window', [
      'createOutputChannel',
      'createStatusBarItem',
      'showErrorMessage',
      'showInformationMessage',
      'showInputBox',
      'showQuickPick',
      'showWarningMessage',
    ]),
    workspace: jasmine.createSpyObj<typeof vscode.workspace>(
      'vscode.workspace',
      ['getConfiguration']
    ),
    extensions: jasmine.createSpyObj<typeof vscode.extensions>(
      'vscode.extensions',
      ['getExtension']
    ),
  };
}

/**
 * Emitters for events in the 'vscode' module.
 */
export type VscodeEmitters = ReturnType<typeof newVscodeEmitters>;

function newVscodeEmitters() {
  return {
    window: {
      // TODO(oka): Add more `onDid...` event emitters here.
      onDidChangeActiveTextEditor: new vscode.EventEmitter<
        vscode.TextEditor | undefined
      >(),
    },
    workspace: {
      // Add more `onDid...` and `onWill...` event emitters here.
      onDidSaveTextDocument: new vscode.EventEmitter<vscode.TextDocument>(),
    },
  };
}

/**
 * Installs a double for the vscode namespace and returns handlers to interact
 * with it.
 */
export function installVscodeDouble(): {
  vscodeSpy: VscodeSpy;
  vscodeEmitters: VscodeEmitters;
} {
  const vscodeSpy = cleanState(() => newVscodeSpy());
  const vscodeEmitters = cleanState(() => newVscodeEmitters());

  const real = vscode;
  const original = Object.assign({}, real);
  beforeEach(() => {
    real.commands = vscodeSpy.commands;
    real.env = vscodeSpy.env;
    real.extensions = vscodeSpy.extensions;
    real.window = buildNamespace(vscodeSpy.window, vscodeEmitters.window);
    real.workspace = buildNamespace(
      vscodeSpy.workspace,
      vscodeEmitters.workspace
    );
  });
  afterEach(() => {
    Object.assign(real, original);
  });

  return {
    vscodeSpy,
    vscodeEmitters,
  };
}

function buildNamespace(
  spies: jasmine.SpyObj<unknown>,
  emitters: {[key: string]: vscode.EventEmitter<unknown>}
) {
  return Object.fromEntries([
    ...Object.entries(spies).map(([key, spy]) => [
      key,
      (...args: unknown[]) => (spy as jasmine.Spy)(...args),
    ]),
    ...Object.entries(emitters).map(([key, emitter]) => [key, emitter.event]),
  ]);
}
