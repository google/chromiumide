// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as vscode from 'vscode';
import * as commonUtil from '../../../../shared/app/common/common_util';
import {CancelledError} from '../../../../shared/app/common/exec/types';
import * as testing from '../../testing';

describe('fake exec', () => {
  const fakeExec = testing.installFakeExec();

  it('installStdout returns successfully', async () => {
    // Fake command does not exist.
    fakeExec.installStdout('foo', ['bar'], 'baz');
    const result = await commonUtil.exec('foo', ['bar']);
    expect(result).not.toBeInstanceOf(Error);
    if (!(result instanceof Error)) {
      expect(result.exitStatus).toEqual(0);
      expect(result.stdout).toEqual('baz');
    }
  });

  it('installCallback returns string successfully', async () => {
    // Fake command does not exist.
    fakeExec.installCallback('foo', ['bar'], async () => {
      return 'baz';
    });
    const result = await commonUtil.exec('foo', ['bar']);
    expect(result).not.toBeInstanceOf(Error);
    if (!(result instanceof Error)) {
      expect(result.exitStatus).toEqual(0);
      expect(result.stdout).toEqual('baz');
    }
  });

  it('installCallback returns Error', async () => {
    // Fake command does not exist.
    fakeExec.installCallback('foo', ['bar'], async () => {
      return new Error('expected error');
    });
    const result = await commonUtil.exec('foo', ['bar']);
    expect(result).toBeInstanceOf(Error);
  });

  it('installCallback with cancellation token returns successfully if not cancelled', async () => {
    const tokenSource = new vscode.CancellationTokenSource();
    fakeExec.installCallback('foo', ['bar'], async () => 'baz');
    const result = await commonUtil.exec('foo', ['bar'], {
      cancellationToken: tokenSource.token,
    });
    expect(result).not.toBeInstanceOf(Error);
    if (!(result instanceof Error)) {
      expect(result.exitStatus).toEqual(0);
      expect(result.stdout).toEqual('baz');
    }
  });

  it('installCallback returns CancelledError when token source is cancelled before executing', async () => {
    const tokenSource = new vscode.CancellationTokenSource();

    const guard = await testing.BlockingPromise.new('');
    fakeExec.installCallback(
      'foo',
      ['bar'],
      async () => await guard.promise,
      jasmine.anything()
    );

    tokenSource.cancel();
    const result = commonUtil.exec('foo', ['bar'], {
      cancellationToken: tokenSource.token,
    });
    expect(await result).toBeInstanceOf(CancelledError);
    guard.unblock();
  });

  it('installCallback returns CancelledError when token source is cancelled a while after executing', async () => {
    const tokenSource = new vscode.CancellationTokenSource();

    const guard = await testing.BlockingPromise.new('');
    fakeExec.installCallback(
      'foo',
      ['bar'],
      async () => await guard.promise,
      jasmine.anything()
    );

    const result = commonUtil.exec('foo', ['bar'], {
      cancellationToken: tokenSource.token,
    });
    await testing.flushMicrotasksUntil(async () => true, 5);
    tokenSource.cancel();
    expect(await result).toBeInstanceOf(CancelledError);
    guard.unblock();
  });
});
