// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as config from '../../services/config';
import * as injectedVscode from '../unit/injected_modules/vscode';
import {cleanState} from './clean_state';
import * as fakes from './fakes';

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

type SpiableVscodeWorkspace = typeof vscode.workspace & {
  openTextDocument: jasmine.Func;
};

/**
 * Creates a new VscodeSpy.
 * The fields should be substituted in installVscodeDouble().
 */
function newVscodeSpy() {
  return {
    comments: jasmine.createSpyObj<typeof vscode.comments>('vscode.comments', [
      'createCommentController',
    ]),
    commands: jasmine.createSpyObj<typeof vscode.commands>('vscode.commands', [
      'registerCommand',
      'registerTextEditorCommand',
      'executeCommand',
      'getCommands',
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
      'showOpenDialog',
      'showQuickPick',
      'showTextDocument',
      'showWarningMessage',
    ]),
    workspace: jasmine.createSpyObj<SpiableVscodeWorkspace>(
      'vscode.workspace',
      [
        'getConfiguration',
        'openTextDocument',
        'registerTextDocumentContentProvider',
      ]
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
      onDidChangeActiveColorTheme: new vscode.EventEmitter<vscode.ColorTheme>(),
      onDidChangeActiveNotebookEditor: new vscode.EventEmitter<
        vscode.NotebookEditor | undefined
      >(),
      onDidChangeActiveTerminal: new vscode.EventEmitter<
        vscode.Terminal | undefined
      >(),
      onDidChangeActiveTextEditor: new vscode.EventEmitter<
        vscode.TextEditor | undefined
      >(),
      onDidChangeTerminalState: new vscode.EventEmitter<vscode.Terminal>(),
      onDidChangeTextEditorOptions:
        new vscode.EventEmitter<vscode.TextEditorOptionsChangeEvent>(),
      onDidChangeTextEditorSelection:
        new vscode.EventEmitter<vscode.TextEditorSelectionChangeEvent>(),
      onDidChangeTextEditorViewColumn:
        new vscode.EventEmitter<vscode.TextEditorViewColumnChangeEvent>(),
      onDidChangeTextEditorVisibleRanges:
        new vscode.EventEmitter<vscode.TextEditorVisibleRangesChangeEvent>(),
      onDidChangeVisibleNotebookEditors: new vscode.EventEmitter<
        readonly vscode.NotebookEditor[]
      >(),
      onDidChangeVisibleTextEditors: new vscode.EventEmitter<
        readonly vscode.TextEditor[]
      >(),
      onDidChangeWindowState: new vscode.EventEmitter<vscode.WindowState>(),
      onDidCloseTerminal: new vscode.EventEmitter<vscode.Terminal>(),
      onDidOpenTerminal: new vscode.EventEmitter<vscode.Terminal>(),
    },
    workspace: {
      onDidChangeConfiguration:
        new vscode.EventEmitter<vscode.ConfigurationChangeEvent>(),
      onDidChangeTextDocument:
        new vscode.EventEmitter<vscode.TextDocumentChangeEvent>(),
      onDidChangeWorkspaceFolders:
        new vscode.EventEmitter<vscode.WorkspaceFoldersChangeEvent>(),
      onDidCloseNotebookDocument:
        new vscode.EventEmitter<vscode.NotebookDocument>(),
      onDidCloseTextDocument: new vscode.EventEmitter<vscode.TextDocument>(),
      onDidCreateFiles: new vscode.EventEmitter<vscode.FileCreateEvent>(),
      onDidDeleteFiles: new vscode.EventEmitter<vscode.FileDeleteEvent>(),
      onDidGrantWorkspaceTrust: new vscode.EventEmitter<void>(),
      onDidOpenNotebookDocument:
        new vscode.EventEmitter<vscode.NotebookDocument>(),
      onDidOpenTextDocument: new vscode.EventEmitter<vscode.TextDocument>(),
      onDidRenameFiles: new vscode.EventEmitter<vscode.FileRenameEvent>(),
      onDidSaveNotebookDocument:
        new vscode.EventEmitter<vscode.NotebookDocument>(),
      onDidSaveTextDocument: new vscode.EventEmitter<vscode.TextDocument>(),
      onWillCreateFiles: new vscode.EventEmitter<vscode.FileWillCreateEvent>(),
      onWillDeleteFiles: new vscode.EventEmitter<vscode.FileWillDeleteEvent>(),
      onWillRenameFiles: new vscode.EventEmitter<vscode.FileWillRenameEvent>(),
      onWillSaveTextDocument:
        new vscode.EventEmitter<vscode.TextDocumentWillSaveEvent>(),
    },
  };
}

/**
 * Spy objects for vscode properties.
 *
 * Example:
 *  vscodeGetters.workspace.workspaceFolders.and.returnValue(fakeValue);
 */
export type VscodeGetters = ReturnType<typeof newVscodeGetters>;

export type VscodeProperties = ReturnType<typeof newVscodeProperties>;

/**
 * Returns an object with settable properties in vscode namespaces.
 *
 * Properties whose annotated type can be undefined with a comment "not" are
 * not undefined on the real vscode namespace.
 */
function newVscodeProperties() {
  // TODO(oka): Add debug, env, extensions, scm, and tasks namespaces.
  return {
    window: {
      activeTerminal: undefined as vscode.Terminal | undefined,
      activeTextEditor: undefined as vscode.TextEditor | undefined,
      state: {focused: true},
      terminals: [] as vscode.Terminal[],
      visibleTextEditors: [] as vscode.TextEditor[],
    },
    workspace: {
      fs: undefined as vscode.FileSystem | /*not*/ undefined,
      name: undefined as string | undefined,
      rootPath: undefined as string | undefined,
      workspaceFile: undefined as vscode.Uri | undefined,
      workspaceFolders: undefined as vscode.WorkspaceFolder[] | undefined,
      textDocuments: [] as vscode.TextDocument[],
    },
  };
}

/**
 * Returns an object, which for each property of `target` has a property of
 * the same name, whose value is a jasmine Spy. Each of these spies is
 * initialized to return the current value of corresponding property on
 * `target`.
 *
 * This means the spies initially behave as follows:
 * buildGetters('x', x).y() === x.y;
 *
 * But they can be changed, e.g., as follows:
 * const getters = buildGetters('x', x);
 * getters.y.and.callFake(() => 2 * x.y);
 */
function buildGetters<T extends {}>(
  nameSpace: string,
  target: T
): {[P in keyof T]: jasmine.Spy<() => T[P]>} {
  type R = {[P in keyof T]: jasmine.Spy<() => T[P]>};

  const res: Partial<R> = {};
  for (const property in target) {
    res[property] = jasmine
      .createSpy<() => T[typeof property]>(`${nameSpace}.${String(property)}`)
      .and.callFake(() => target[property]);
  }
  return res as R;
}

/**
 * Returns an object, which for each property of `target` has a property of the
 * same name, whose value is obtained by applying buildGetters for the original
 * property.
 *
 * This means the spies initially behave as follows:
 * buildNamespaceGetters('x', x).y.z() === x.y.z;
 *
 * But they can be changed, e.g., as follows:
 * const getters = buildNamespaceGetters('x', x);
 * getters.y.z.and.callFake(() => 2 * x.y.z);
 */
function buildNamespaceGetters<T extends {[K in keyof T]: {}}>(
  nameSpace: string,
  target: T
): {[N in keyof T]: {[P in keyof T[N]]: jasmine.Spy<() => T[N][P]>}} {
  type R = {[N in keyof T]: {[P in keyof T[N]]: jasmine.Spy<() => T[N][P]>}};

  const res: Partial<R> = {};
  for (const property in target) {
    res[property] = buildGetters(
      `${nameSpace}.${String(property)}}`,
      target[property]
    );
  }
  return res as R;
}

function newVscodeGetters(vscodeProperties: VscodeProperties) {
  return buildNamespaceGetters('vscode', vscodeProperties);
}

function copyVscodeNamespaces() {
  return {
    authentication: vscode.authentication,
    commands: vscode.commands,
    comments: vscode.comments,
    debug: vscode.debug,
    env: vscode.env,
    extensions: vscode.extensions,
    languages: vscode.languages,
    notebooks: vscode.notebooks,
    scm: vscode.scm,
    tasks: vscode.tasks,
    tests: vscode.tests,
    window: vscode.window,
    workspace: vscode.workspace,
  };
}

/**
 * Installs a double for the vscode namespace and returns handlers to interact
 * with it.
 */
export function installVscodeDouble(): {
  vscodeSpy: VscodeSpy;
  vscodeEmitters: VscodeEmitters;
  vscodeGetters: VscodeGetters;
  vscodeProperties: VscodeProperties;
} {
  const vscodeSpy = cleanState(() => newVscodeSpy());
  const vscodeEmitters = cleanState(() => newVscodeEmitters());
  const vscodeProperties = cleanState(() => newVscodeProperties());
  const vscodeGetters = cleanState(() => newVscodeGetters(vscodeProperties));

  // This an injected module for unit tests and real vscode module for integration tests.
  const theVscode = vscode;

  const isInjected = theVscode.env.appName === injectedVscode.env.appName;

  // We cannot use Object.assign({}, real) here; if we do so we see the
  // following error in unit tests where vscode is an injected module.
  // TypeError: Cannot set property CancellationTokenSource of #<Object> which has only a getter
  const original = copyVscodeNamespaces();
  beforeEach(() => {
    const double = {
      commands: vscodeSpy.commands,
      comments: vscodeSpy.comments,
      env: buildNamespace(theVscode.env, vscodeSpy.env, {}, {}),
      extensions: buildNamespace(
        theVscode.extensions,
        vscodeSpy.extensions,
        {},
        {}
      ),
      window: buildNamespace(
        theVscode.window,
        vscodeSpy.window,
        vscodeEmitters.window,
        vscodeGetters.window
      ),
      workspace: buildNamespace(
        theVscode.workspace,
        vscodeSpy.workspace,
        vscodeEmitters.workspace,
        vscodeGetters.workspace
      ),
    };

    if (isInjected) {
      injectedVscode.setVscode(double);
    } else {
      theVscode.commands = double.commands;
      theVscode.comments = double.comments;
      theVscode.env = double.env;
      theVscode.extensions = double.extensions;
      theVscode.window = double.window;
      theVscode.workspace = double.workspace;
    }

    const fakeCommands = new fakes.FakeCommands(vscode.window);
    vscodeSpy.commands.registerCommand.and.callFake((id, callback, thisArg) =>
      fakeCommands.registerCommand(id, callback, thisArg)
    );
    vscodeSpy.commands.registerTextEditorCommand.and.callFake(
      (id, callback, thisArg) =>
        fakeCommands.registerTextEditorCommand(id, callback, thisArg)
    );
    vscodeSpy.commands.executeCommand.and.callFake((id, ...args) =>
      fakeCommands.executeCommand(id, ...args)
    );
    vscodeSpy.commands.getCommands.and.callFake(() =>
      fakeCommands.getCommands()
    );
  });
  afterEach(() => {
    if (isInjected) {
      injectedVscode.setVscode(original);
    } else {
      Object.assign(theVscode, original);
    }
  });

  return {
    vscodeSpy,
    vscodeEmitters,
    vscodeGetters,
    vscodeProperties,
  };
}

/**
 * Creates a new object representing a fake vscode namespace. It creates the
 * result by first copying the original namespace and then updating it using
 * spies and emitters.
 * If the given namespace comes from real vscode (in case of integration tests),
 * we don't copy the original because Object.entries fails for the object.
 */
function buildNamespace(
  maybeFakeVscodeNamespace: Object,
  spies: jasmine.SpyObj<unknown>,
  emitters: {[key: string]: vscode.EventEmitter<unknown>},
  getters: {[key: string]: () => unknown} = {}
) {
  let original: [string, unknown][] = [];
  try {
    original = Object.entries(maybeFakeVscodeNamespace);
  } catch (_e) {
    // Do nothing
  }
  return Object.defineProperties(
    Object.fromEntries([
      ...original,
      ...Object.entries(spies).map(([key, spy]) => [
        key,
        (...args: unknown[]) => (spy as jasmine.Spy)(...args),
      ]),
      ...Object.entries(emitters).map(([key, emitter]) => [key, emitter.event]),
    ]),
    Object.fromEntries([
      ...Object.entries(getters).map(([key]) => [key, {get: getters[key]}]),
    ])
  );
}

/**
 * Installs a fake configuration for testing.
 */
export function installFakeConfigs(
  vscodeSpy: VscodeSpy,
  vscodeEmitters: VscodeEmitters
): void {
  const subscriptions: vscode.Disposable[] = [];

  beforeEach(() => {
    // Prepare fake config for the old prefix as well for testing migrator.
    for (const prefix of [config.TEST_ONLY.CHROMIUMIDE_PREFIX, 'cros-ide']) {
      const fakeConfig = fakes.FakeWorkspaceConfiguration.fromSection(
        prefix,
        subscriptions
      );

      vscodeSpy.workspace.getConfiguration
        .withArgs(prefix)
        .and.returnValue(fakeConfig as vscode.WorkspaceConfiguration);

      subscriptions.push(
        fakeConfig.onDidChange(ev =>
          vscodeEmitters.workspace.onDidChangeConfiguration.fire(ev)
        )
      );
    }
  });

  afterEach(() => {
    vscode.Disposable.from(...subscriptions).dispose();
    subscriptions.splice(0);
  });
}
