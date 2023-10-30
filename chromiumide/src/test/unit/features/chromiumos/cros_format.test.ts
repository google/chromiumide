// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {TEST_ONLY} from '../../../../features/chromiumos/cros_format';
import {Metrics} from '../../../../features/metrics/metrics';
import {StatusManager, TaskStatus} from '../../../../ui/bg_task_status';
import * as testing from '../../../testing';
import {FakeTextDocument} from '../../../testing/fakes';
import type * as commonUtil from '../../../../common/common_util';

const {CrosFormat} = TEST_ONLY;

describe('Cros format', () => {
  const crosUri = vscode.Uri.file('/ssd/chromiumos/src/some/file.md');

  const {fakeExec} = testing.installFakeExec();

  const state = testing.cleanState(() => {
    const statusManager = jasmine.createSpyObj<StatusManager>('statusManager', [
      'setStatus',
    ]);
    const crosFormat = new CrosFormat(
      '/ssd/chromiumos',
      statusManager,
      vscode.window.createOutputChannel('unused')
    );
    return {
      statusManager,
      crosFormat,
    };
  });

  beforeEach(() => {
    spyOn(Metrics, 'send');
  });

  it('shows error when the command fails (execution error)', async () => {
    fakeExec.and.resolveTo(new Error());

    await state.crosFormat.provideDocumentFormattingEdits(
      new FakeTextDocument({uri: crosUri})
    );

    expect(state.statusManager.setStatus).toHaveBeenCalledOnceWith(
      'Formatter',
      TaskStatus.ERROR
    );
    expect(Metrics.send).toHaveBeenCalledOnceWith({
      category: 'error',
      group: 'format',
      name: 'cros_format_call_error',
      description: 'call to cros format failed',
    });
  });

  it('shows error when the command fails (exit status 127)', async () => {
    const execResult: commonUtil.ExecResult = {
      exitStatus: 127,
      stderr: 'stderr',
      stdout: 'stdout',
    };
    fakeExec.and.resolveTo(execResult);

    await state.crosFormat.provideDocumentFormattingEdits(
      new FakeTextDocument({uri: crosUri})
    );

    expect(state.statusManager.setStatus).toHaveBeenCalledOnceWith(
      'Formatter',
      TaskStatus.ERROR
    );
    expect(Metrics.send).toHaveBeenCalledOnceWith({
      category: 'error',
      group: 'format',
      name: 'cros_format_return_error',
      description: 'cros format returned error',
    });
  });

  it('does not format code that is already formatted correctly', async () => {
    const execResult: commonUtil.ExecResult = {
      exitStatus: 0,
      stderr: '',
      stdout: '',
    };
    fakeExec.and.resolveTo(execResult);

    const edits = await state.crosFormat.provideDocumentFormattingEdits(
      new FakeTextDocument({uri: crosUri})
    );

    expect(edits).toBeUndefined();
    expect(state.statusManager.setStatus).toHaveBeenCalledOnceWith(
      'Formatter',
      TaskStatus.OK
    );
    expect(Metrics.send).not.toHaveBeenCalled();
  });

  it('formats code', async () => {
    const execResult: commonUtil.ExecResult = {
      exitStatus: 1,
      stderr: '',
      stdout: 'formatted\nfile',
    };
    fakeExec.and.resolveTo(execResult);

    const edits = await state.crosFormat.provideDocumentFormattingEdits(
      new FakeTextDocument({uri: crosUri})
    );

    expect(fakeExec).toHaveBeenCalled();
    expect(edits).toBeDefined();
    expect(state.statusManager.setStatus).toHaveBeenCalledOnceWith(
      'Formatter',
      TaskStatus.OK
    );
    expect(Metrics.send).toHaveBeenCalledOnceWith({
      category: 'background',
      group: 'format',
      name: 'cros_format',
      description: 'cros format',
    });
  });

  it('does not format files outside CrOS chroot', async () => {
    const edits = await state.crosFormat.provideDocumentFormattingEdits(
      new FakeTextDocument({uri: vscode.Uri.file('/not/a/cros/file.md')})
    );

    expect(fakeExec).not.toHaveBeenCalled();
    expect(edits).toBeUndefined();
    expect(Metrics.send).not.toHaveBeenCalled();
  });
});
