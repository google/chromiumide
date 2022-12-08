// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as commonUtil from '../../../../common/common_util';
import {TEST_ONLY} from '../../../../features/chromiumos/cros_format';
import {StatusManager, TaskStatus} from '../../../../ui/bg_task_status';
import * as testing from '../../../testing';
import {FakeTextDocument} from '../../../testing/fakes';

const {CrosFormat} = TEST_ONLY;

describe('Cros format', () => {
  const crosUri = vscode.Uri.file('/ssd/chromiumos/src/some/file.md');

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

  it('shows error when the command fails (execution error)', async () => {
    spyOn(commonUtil, 'exec').and.resolveTo(new Error());

    await state.crosFormat.provideDocumentFormattingEdits(
      new FakeTextDocument({uri: crosUri})
    );

    expect(state.statusManager.setStatus).toHaveBeenCalledOnceWith(
      'Formatter',
      TaskStatus.ERROR
    );
  });

  it('shows error when the command fails (exit status 127)', async () => {
    const execResult: commonUtil.ExecResult = {
      exitStatus: 127,
      stderr: 'stderr',
      stdout: 'stdout',
    };
    spyOn(commonUtil, 'exec').and.resolveTo(execResult);

    await state.crosFormat.provideDocumentFormattingEdits(
      new FakeTextDocument({uri: crosUri})
    );

    expect(state.statusManager.setStatus).toHaveBeenCalledOnceWith(
      'Formatter',
      TaskStatus.ERROR
    );
  });

  it('does not format code that is already formatted correctly', async () => {
    const execResult: commonUtil.ExecResult = {
      exitStatus: 0,
      stderr: '',
      stdout: '',
    };
    spyOn(commonUtil, 'exec').and.resolveTo(execResult);

    const edits = await state.crosFormat.provideDocumentFormattingEdits(
      new FakeTextDocument({uri: crosUri})
    );

    expect(edits).toBeUndefined();
    expect(state.statusManager.setStatus).toHaveBeenCalledOnceWith(
      'Formatter',
      TaskStatus.OK
    );
  });

  it('formats code', async () => {
    const execResult: commonUtil.ExecResult = {
      exitStatus: 1,
      stderr: '',
      stdout: 'formatted\nfile',
    };
    spyOn(commonUtil, 'exec').and.resolveTo(execResult);

    const edits = await state.crosFormat.provideDocumentFormattingEdits(
      new FakeTextDocument({uri: crosUri})
    );

    expect(commonUtil.exec).toHaveBeenCalled();
    expect(edits).toBeDefined();
    expect(state.statusManager.setStatus).toHaveBeenCalledOnceWith(
      'Formatter',
      TaskStatus.OK
    );
  });

  it('does not format files outside CrOS chroot', async () => {
    spyOn(commonUtil, 'exec');

    const edits = await state.crosFormat.provideDocumentFormattingEdits(
      new FakeTextDocument({uri: vscode.Uri.file('/not/a/cros/file.md')})
    );

    expect(commonUtil.exec).not.toHaveBeenCalled();
    expect(edits).toBeUndefined();
  });
});
