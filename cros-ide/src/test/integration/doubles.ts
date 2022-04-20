// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';

const VSCODE_SPY = newVscodeSpy();

/**
 * Spy for the `vscode` module.
 */
export type VscodeSpy = typeof VSCODE_SPY;

type SpiableVscodeWindow = Omit<
  typeof vscode.window,
  'showInformationMessage'
> & {
  // Original type doesn't work due to
  // https://github.com/DefinitelyTyped/DefinitelyTyped/issues/42455 .
  showInformationMessage: jasmine.Func;
};

/**
 * Creates a new VscodeSpy.
 * The fields should be substituted in installVscodeDouble().
 */
function newVscodeSpy() {
  return {
    env: jasmine.createSpyObj<typeof vscode.env>('vscode.env', [
      'openExternal',
    ]),
    window: jasmine.createSpyObj<SpiableVscodeWindow>('vscode.window', [
      'showInformationMessage',
    ]),
    workspace: jasmine.createSpyObj<typeof vscode.workspace>(
      'vscode.workspace',
      ['getConfiguration']
    ),
  };
}

const VSCODE_EMITTERS = newVscodeEmitters();

/**
 * Emitters for events in the 'vscode' module.
 */
export type VscodeEmitters = typeof VSCODE_EMITTERS;

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

  const original = {
    env: vscode.env,
    window: vscode.window,
    workspace: vscode.workspace,
  };
  const real = vscode;
  beforeEach(() => {
    real.env = vscodeSpy.env;
    real.window = buildNamespace(vscodeSpy.window, vscodeEmitters.window);
    real.workspace = buildNamespace(
      vscodeSpy.workspace,
      vscodeEmitters.workspace
    );
  });
  afterEach(() => {
    real.env = original.env;
    real.window = original.window;
    real.workspace = original.workspace;
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

type StateInitializer<T> = (() => Promise<T>) | (() => T);

// See go/cleanstate.
function cleanState<NewState extends {}>(
  init: StateInitializer<NewState>
): NewState {
  const state = {} as NewState;
  beforeEach(async () => {
    // Clear state before every test case.
    for (const prop of Object.getOwnPropertyNames(state)) {
      delete (state as {[k: string]: unknown})[prop];
    }
    Object.assign(state, await init());
  });
  return state;
}
