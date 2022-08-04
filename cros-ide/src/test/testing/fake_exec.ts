// Copyright 2022 The ChromiumOS Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {
  ExecOptions,
  ExecResult,
  setExecForTesting,
} from '../../common/common_util';
import {cleanState} from './clean_state';

/**
 * Returns execution result or undefined if args is not handled.
 *
 * The result can be just a string, which will be returned as stdout with zero exit status.
 * `ExecResult`, can emulate return with stderr and non-zero exit status.
 * `Error` can be used to simulate that the command was not found.
 */
type Handler = (
  args: string[],
  options: ExecOptions
) => Promise<string | ExecResult | Error | undefined>;

export function exactMatch(
  wantArgs: string[],
  handle: (options: ExecOptions) => Promise<string | ExecResult | Error>
): Handler {
  return async (args, options) => {
    if (
      wantArgs.length === args.length &&
      wantArgs.every((x, i) => x === args[i])
    ) {
      return await handle(options);
    }
    return undefined;
  };
}

export function prefixMatch(
  wantPrefix: string[],
  handle: (
    restArgs: string[],
    options: ExecOptions
  ) => Promise<string | ExecResult | Error>
): Handler {
  return async (args, options) => {
    if (
      wantPrefix.length <= args.length &&
      wantPrefix.every((x, i) => x === args[i])
    ) {
      return await handle(args.slice(wantPrefix.length), options);
    }
    return undefined;
  };
}

export function lazyHandler(f: () => Handler): Handler {
  return async (args, options) => {
    return f()(args, options);
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
    options: ExecOptions = {}
  ): Promise<ExecResult | Error> {
    for (const handler of this.handlers.get(name) || []) {
      const result = await handler(args, options);
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
