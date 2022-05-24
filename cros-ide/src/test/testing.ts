// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  Chroot,
  ExecOptions,
  ExecResult,
  setExecForTesting,
} from '../common/common_util';
import * as extension from '../extension';

/**
 * Returns execution result or undefined if args is not handled.
 *
 * The result can be just a string, which will be returned as stdout with zero exit status.
 * `ExecResult`, can emulate return with stderr and non-zero exit status.
 * `Error` can be used to simulate that the command was not found.
 */
type Handler = (
  args: string[],
  opt?: ExecOptions
) => Promise<string | ExecResult | Error | undefined>;

export function exactMatch(
  wantArgs: string[],
  handle: (opt?: ExecOptions) => Promise<string | ExecResult | Error>
): Handler {
  return async (args, opt) => {
    if (
      wantArgs.length === args.length &&
      wantArgs.every((x, i) => x === args[i])
    ) {
      return await handle(opt);
    }
    return undefined;
  };
}

export function prefixMatch(
  wantPrefix: string[],
  handle: (restArgs: string[], opt?: ExecOptions) => Promise<string>
): Handler {
  return async (args, opt) => {
    if (
      wantPrefix.length <= args.length &&
      wantPrefix.every((x, i) => x === args[i])
    ) {
      return await handle(args.slice(wantPrefix.length), opt);
    }
    return undefined;
  };
}

export function lazyHandler(f: () => Handler): Handler {
  return async (args, opt) => {
    return f()(args, opt);
  };
}

export class FakeExec {
  handlers: Map<string, Handler[]> = new Map();
  on(name: string, handle: Handler): FakeExec {
    if (!this.handlers.has(name)) {
      this.handlers.set(name, []);
    }
    this.handlers.get(name)!.push(handle);
    return this;
  }
  async exec(
    name: string,
    args: string[],
    _log?: (line: string) => void,
    opt?: ExecOptions
  ): Promise<ExecResult | Error> {
    for (const handler of this.handlers.get(name) || []) {
      const result = await handler(args, opt);
      if (result === undefined) {
        continue;
      }
      if (typeof result === 'string') {
        return {exitStatus: 0, stdout: result, stderr: ''};
      }
      return result;
    }
    throw new Error(`${name} ${args.join(' ')}: not handled`);
  }
}

export async function putFiles(dir: string, files: {[name: string]: string}) {
  for (const [name, content] of Object.entries(files)) {
    const filePath = path.join(dir, name);
    await fs.promises.mkdir(path.dirname(filePath), {recursive: true});
    await fs.promises.writeFile(path.join(dir, name), content);
  }
}

type StateInitializer<T> = (() => Promise<T>) | (() => T);

/**
 * See go/cleanstate for details.
 *
 * Usage:
 *
 * describe('Foo', () => {
 *   const state = cleanState(() => {foo: new Foo()});
 *
 *   it('does bar', () => {
 *     expect(state.foo.bar()).toBeTrue();
 *   });
 * })
 *
 * Beware that class methods are not assigned to the returned object.
 * Writing `cleanState(() => new Foo())` in the above code doesn't work.
 */
export function cleanState<NewState extends {}>(
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

/**
 * Installs fake exec for testing. This function should be called in describe.
 *
 * Calling this function replaces commonUtil.exec with a fake, and returns a
 * handler to it. It internally uses cleanState to create fresh instances per
 * test.
 *
 * TODO(oka): Consider replacing FakeExec with a standard Jasmine spy object.
 */
export function installFakeExec(): {fakeExec: FakeExec} {
  const fakeExec = new FakeExec();

  const state = cleanState(() => {
    Object.assign(fakeExec, new FakeExec()); // clear handlers
    return {undo: setExecForTesting(fakeExec.exec.bind(fakeExec))};
  });
  afterEach(() => {
    state.undo();
  });

  return {fakeExec};
}

/**
 * Returns a state with the path to a temporary directory, installing an
 * afterEach hook to remove the directory.
 */
export function tempDir(): {path: string} {
  const state = cleanState(async () => {
    return {
      path: await fs.promises.mkdtemp(os.tmpdir() + '/'),
    };
  });
  afterEach(() => fs.promises.rm(state.path, {recursive: true}));
  return state;
}

/**
 * Ensure all currently pending microtasks and all microtasks transitively
 * queued by them have finished.
 *
 * This function can be useful for waiting for an async event handler to finish
 * after an event is fired, for example.
 */
export async function flushMicrotasks(): Promise<void> {
  return new Promise(resolve => {
    setImmediate(resolve);
  });
}

/**
 * Builds fake chroot environment under tempDir, and returns the path to the
 * fake chroot (`${tempDir}/chroot`).
 */
export async function buildFakeChroot(tempDir: string): Promise<Chroot> {
  await putFiles(tempDir, {'chroot/etc/cros_chroot_version': '42'});
  return path.join(tempDir, 'chroot') as Chroot;
}

/**
 * ExtensionApiForTesting is similar to ExtensionApi, but some fields are
 * guaranteed to be available.
 */
interface ExtensionApiForTesting extends extension.ExtensionApi {
  context: vscode.ExtensionContext;
}

/**
 * Activates the extension and returns its public API.
 */
export async function activateExtension(): Promise<ExtensionApiForTesting> {
  const extension =
    vscode.extensions.getExtension<ExtensionApiForTesting>('google.cros-ide')!;
  return await extension.activate();
}

export async function closeDocument(document: vscode.TextDocument) {
  await vscode.window.showTextDocument(document);
  await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
}
