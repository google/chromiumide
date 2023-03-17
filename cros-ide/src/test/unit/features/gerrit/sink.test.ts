// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {ErrorMessageRouter} from '../../../../features/gerrit/sink';
import * as metrics from '../../../../features/metrics/metrics';
import * as bgTaskStatus from '../../../../ui/bg_task_status';
import {TaskStatus} from '../../../../ui/bg_task_status';
import * as testing from '../../../testing';

describe('ErrorMessageRouter', () => {
  const state = testing.cleanState(() => {
    const outputChannel = jasmine.createSpyObj<vscode.OutputChannel>(
      'outputChannel',
      ['appendLine']
    );
    const statusManager = jasmine.createSpyObj<bgTaskStatus.StatusManager>(
      'statusManager',
      ['setStatus']
    );
    const errorMessageRouter = new ErrorMessageRouter(
      outputChannel,
      statusManager
    );
    return {
      outputChannel,
      statusManager,
      errorMessageRouter,
    };
  });

  beforeEach(() => {
    spyOn(metrics, 'send');
  });

  it('shows a simple message', () => {
    state.errorMessageRouter.show('simple message');
    expect(state.outputChannel.appendLine).toHaveBeenCalledOnceWith(
      'simple message'
    );
    expect(metrics.send).toHaveBeenCalledOnceWith({
      category: 'error',
      group: 'gerrit',
      description: 'simple message',
    });
    expect(state.statusManager.setStatus).toHaveBeenCalledOnceWith(
      'Gerrit',
      TaskStatus.ERROR
    );
  });

  it('shows a message with custom metrics', () => {
    state.errorMessageRouter.show({
      log: 'log message',
      metrics: 'metrics message',
    });
    expect(state.outputChannel.appendLine).toHaveBeenCalledOnceWith(
      'log message'
    );
    expect(metrics.send).toHaveBeenCalledOnceWith({
      category: 'error',
      group: 'gerrit',
      description: 'metrics message',
    });
    expect(state.statusManager.setStatus).toHaveBeenCalledOnceWith(
      'Gerrit',
      TaskStatus.ERROR
    );
  });

  it('shows a message supressing status change', () => {
    state.errorMessageRouter.show({
      log: 'log message',
      metrics: 'metrics message',
      noErrorStatus: true,
    });
    expect(state.outputChannel.appendLine).toHaveBeenCalledOnceWith(
      'log message'
    );
    expect(metrics.send).toHaveBeenCalledOnceWith({
      category: 'error',
      group: 'gerrit',
      description: 'metrics message',
    });
    expect(state.statusManager.setStatus).not.toHaveBeenCalled();
  });
});
