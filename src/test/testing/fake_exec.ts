// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {
  setExecForTesting,
  exec as commonUtilExec,
} from '../../../shared/app/common/common_util';
import {
  ExecOptions,
  CancelledError,
} from '../../../shared/app/common/exec/types';
import {cleanState} from './clean_state';

type ExecType = typeof commonUtilExec;

/**
 * FakeExec class is an extension of a jasmine spy object that provides utilities to install canned
 * responses.
 */
export class FakeExec
  // Spy interface is a hybrid type and is a callable. We omit the callable from the interface here
  // because a class cannot be a callable. It's presumably OK since test code wouldn't call on a
  // spy.
  implements Pick<jasmine.Spy<ExecType>, 'calls' | 'withArgs' | 'and'>
{
  constructor(private readonly spy: jasmine.Spy<ExecType>) {}

  /**
   * Installs fixed stdout. The last optional parameter is if given used to match the options given
   * to exec.
   */
  installStdout(
    name: jasmine.Expected<string>,
    args: jasmine.Expected<string[]>,
    stdout: string,
    options?: jasmine.Expected<ExecOptions>
  ): void {
    this.installCallback(name, args, () => stdout, options);
  }

  /**
   * Installs a callback. If the callback returns a string, it's converted to a successful result
   * with the stdout being the returned string and stderr empty. The last optional parameter is if
   * given used to match the options given to exec.
   */
  installCallback(
    name: jasmine.Expected<string>,
    args: jasmine.Expected<string[]>,
    callback: (
      name: string,
      args: string[],
      options?: ExecOptions
    ) => Promise<Awaited<ReturnType<ExecType>> | string> | string,
    options: jasmine.Expected<ExecOptions> = jasmine.anything()
  ): void {
    this.withArgs(name, args, options).and.callFake(
      async (name, args, options) => {
        let done = false;
        const promises = [callback(name, args, options)];
        // Use array of Disposable instead of one Disposable instance since it would be mistakenly
        // reported that the single subscription to be always undefined and the
        // subscription.dispose() is called on never after Promise.race.
        const subscriptions: vscode.Disposable[] = [];
        if (options?.cancellationToken) {
          const token = options.cancellationToken;
          promises.push(
            new Promise(resolve => {
              if (done) return; // Callback finished before the token is cancelled.
              if (token.isCancellationRequested) {
                resolve(new CancelledError(name, args));
                return;
              }
              subscriptions.push(
                token.onCancellationRequested(() => {
                  resolve(new CancelledError(name, args));
                })
              );
            })
          );
        }
        const res = await Promise.race(promises);
        vscode.Disposable.from(...subscriptions).dispose();
        done = true;
        if (typeof res === 'string') {
          return {exitStatus: 0, stdout: res, stderr: ''};
        }
        return res;
      }
    );
  }

  // jasmine.Spy APIs follow.
  readonly calls = this.spy.calls;
  readonly withArgs = this.spy.withArgs.bind(this.spy);
  readonly and = this.spy.and;
}

/**
 * Installs fake exec for testing. This function should be called in describe.
 *
 * Calling this function replaces commonUtil.exec with a fake, and returns a
 * handler to it. It internally uses cleanState to create fresh instances per
 * test.
 */
export function installFakeExec(): FakeExec {
  const fakeExec = new FakeExec(jasmine.createSpy('exec'));

  const state = cleanState(() => {
    const {realExec, undo} = setExecForTesting((...args) => spiedExec(...args));
    const spiedExec = jasmine.createSpy('exec', realExec);

    Object.assign(fakeExec, new FakeExec(spiedExec)); // clear handlers

    spiedExec.and.callFake((name, args) => {
      throw new Error(`${name} ${args.join(' ')}: not handled`);
    });

    return {undo};
  });
  afterEach(() => {
    state.undo();
  });

  return fakeExec;
}
