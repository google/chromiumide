// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {getDriver} from '../../../../../shared/app/common/driver_repository';
import * as bgTaskStatus from '../../../../../shared/app/ui/bg_task_status';
import {TaskStatus} from '../../../../../shared/app/ui/bg_task_status';
import {Sink} from '../../../../features/gerrit/sink';
import * as testing from '../../../testing';

const driver = getDriver();

describe('Sink', () => {
  const {vscodeSpy} = testing.installVscodeDouble();

  const state = testing.cleanState(() => {
    const outputChannel = jasmine.createSpyObj<vscode.LogOutputChannel>(
      'outputChannel',
      ['appendLine']
    );
    vscodeSpy.window.createOutputChannel.and.returnValue(outputChannel);

    const statusManager = jasmine.createSpyObj<bgTaskStatus.StatusManager>(
      'statusManager',
      ['setStatus', 'setTask']
    );
    return {
      outputChannel,
      statusManager,
      sink: new Sink(statusManager),
    };
  });

  beforeEach(() => {
    spyOn(driver.metrics, 'send');
  });

  it('shows a simple message', () => {
    state.sink.show('simple message');
    expect(state.outputChannel.appendLine).toHaveBeenCalledOnceWith(
      'simple message'
    );
    expect(driver.metrics.send).toHaveBeenCalledOnceWith({
      category: 'error',
      group: 'gerrit',
      description: 'simple message',
      name: 'gerrit_show_error',
    });
    expect(state.statusManager.setStatus).toHaveBeenCalledOnceWith(
      'Gerrit',
      TaskStatus.ERROR
    );
  });

  it('shows a message with custom metrics', () => {
    state.sink.show({
      log: 'log message',
      metrics: 'metrics message',
    });
    expect(state.outputChannel.appendLine).toHaveBeenCalledOnceWith(
      'log message'
    );
    expect(driver.metrics.send).toHaveBeenCalledOnceWith({
      category: 'error',
      group: 'gerrit',
      description: 'metrics message',
      name: 'gerrit_show_error',
    });
    expect(state.statusManager.setStatus).toHaveBeenCalledOnceWith(
      'Gerrit',
      TaskStatus.ERROR
    );
  });

  it('shows a message supressing status change', () => {
    state.sink.show({
      log: 'log message',
      metrics: 'metrics message',
      noErrorStatus: true,
    });
    expect(state.outputChannel.appendLine).toHaveBeenCalledOnceWith(
      'log message'
    );
    expect(driver.metrics.send).toHaveBeenCalledOnceWith({
      category: 'error',
      group: 'gerrit',
      description: 'metrics message',
      name: 'gerrit_show_error',
    });
    expect(state.statusManager.setStatus).not.toHaveBeenCalled();
  });
});
