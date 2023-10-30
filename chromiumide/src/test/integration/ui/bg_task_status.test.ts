// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {
  StatusManager,
  TaskName,
  TaskStatus,
  TEST_ONLY,
} from '../../../ui/bg_task_status';
import {VoidOutputChannel} from '../../testing/fakes';

const {StatusManagerImpl, StatusBarHandler, StatusTreeData} = TEST_ONLY;

describe('Background Task Status', () => {
  const errorBgColor = new vscode.ThemeColor('statusBarItem.errorBackground');

  function assertShowsError(
    statusBarItem: vscode.StatusBarItem,
    tooltip: string
  ) {
    expect(statusBarItem).toEqual(
      jasmine.objectContaining({
        text: '$(error) ChromiumIDE',
        tooltip: tooltip,
        backgroundColor: errorBgColor,
      })
    );
  }

  function assertShowsOk(statusBarItem: vscode.StatusBarItem) {
    expect(statusBarItem).toEqual(
      jasmine.objectContaining({
        text: '$(check) ChromiumIDE',
        tooltip: 'No Problems',
        backgroundColor: undefined,
      })
    );
  }

  let statusBarItem: vscode.StatusBarItem;
  let progressItem: vscode.StatusBarItem;
  let statusManager: StatusManager;
  let statusTreeData: vscode.TreeDataProvider<TaskName>;

  beforeEach(() => {
    statusBarItem = vscode.window.createStatusBarItem();
    statusBarItem.show();
    // progressItem is a spy, because we need to track show() and hide()
    progressItem = jasmine.createSpyObj<vscode.StatusBarItem>('progressItem', [
      'show',
      'hide',
    ]);
    const statusBarHandler = new StatusBarHandler(statusBarItem, progressItem);
    // We need an extra const , because there's no onChange in StatusManager.
    const sm = new StatusManagerImpl();
    sm.onChange(statusBarHandler.refresh.bind(statusBarHandler));
    const std = new StatusTreeData();
    sm.onChange(std.refresh.bind(std));
    statusManager = sm;
    statusTreeData = std;
  });

  function expectProgress(times: {show: number; hide: number}) {
    expect(progressItem.show).toHaveBeenCalledTimes(times.show);
    expect(progressItem.hide).toHaveBeenCalledTimes(times.hide);
  }

  afterEach(() => {
    statusBarItem.dispose();
  });

  it('changes status bar item when tasks are added and removed', () => {
    assertShowsOk(statusBarItem);

    statusManager.setTask('error-A', {status: TaskStatus.ERROR});
    statusManager.setTask('error-B', {status: TaskStatus.ERROR});
    assertShowsError(statusBarItem, 'Errors: error-A, error-B');

    statusManager.deleteTask('error-A');
    assertShowsError(statusBarItem, 'Errors: error-B');

    statusManager.deleteTask('error-B');
    assertShowsOk(statusBarItem);
  });

  it('allows deleting tasks without adding them first', () => {
    statusManager.deleteTask('delete-before-adding');
    assertShowsOk(statusBarItem);
  });

  it('shows abbreviated status of tasks (running -> errors -> warnings -> ok)', () => {
    // When the status manager is created it triggers a refresh without any tasks
    // and hides the progress bar.
    expectProgress({show: 0, hide: 1});

    statusManager.setTask('running', {status: TaskStatus.RUNNING});
    statusManager.setTask('ok', {status: TaskStatus.OK});
    statusManager.setTask('error', {status: TaskStatus.ERROR});
    expect(statusBarItem).toEqual(
      jasmine.objectContaining({
        text: '$(error) ChromiumIDE',
        backgroundColor: errorBgColor,
        tooltip: 'Errors: error',
      })
    );

    expectProgress({show: 3, hide: 1});
    expect(progressItem.text).toEqual('$(sync~spin) Running running...');

    statusManager.deleteTask('running');
    expect(statusBarItem).toEqual(
      jasmine.objectContaining({
        text: '$(error) ChromiumIDE',
        backgroundColor: errorBgColor,
        tooltip: 'Errors: error',
      })
    );
    expectProgress({show: 3, hide: 2});

    statusManager.deleteTask('error');
    expect(statusBarItem).toEqual(
      jasmine.objectContaining({
        text: '$(check) ChromiumIDE',
        backgroundColor: undefined,
        tooltip: 'No Problems',
      })
    );
    expectProgress({show: 3, hide: 3});

    statusManager.deleteTask('ok');
    expect(statusBarItem).toEqual(
      jasmine.objectContaining({
        text: '$(check) ChromiumIDE',
        backgroundColor: undefined,
        tooltip: 'No Problems',
      })
    );
    expectProgress({show: 3, hide: 4});
  });

  it('implements TreeDataProvider.getChildren()', () => {
    statusManager.setTask('task-1', {status: TaskStatus.OK});
    statusManager.setTask('task-2', {status: TaskStatus.OK});

    const children = statusTreeData.getChildren(undefined) as TaskName[];
    expect(children).toEqual(
      jasmine.arrayWithExactContents(['task-1', 'task-2'])
    );
  });

  it('provides TreeItems with status icons', () => {
    statusManager.setTask('task-ok', {status: TaskStatus.OK});
    statusManager.setTask('task-error', {status: TaskStatus.ERROR});
    statusManager.setTask('task-running', {status: TaskStatus.RUNNING});

    const testCases: {
      taskName: string;
      iconId: string;
    }[] = [
      {taskName: 'task-ok', iconId: 'check'},
      {taskName: 'task-error', iconId: 'error'},
      {taskName: 'task-running', iconId: 'sync~spin'},
    ];
    for (const tc of testCases) {
      const treeItem = statusTreeData.getTreeItem(
        tc.taskName
      ) as vscode.TreeItem;
      expect(treeItem.label).toEqual(tc.taskName);
      const icon = treeItem.iconPath! as vscode.ThemeIcon;
      expect(icon.id).toEqual(tc.iconId);
    }
  });

  it('provides TreeItems with commands', () => {
    const command: vscode.Command = {title: '', command: 'command1'};
    statusManager.setTask('task-1', {status: TaskStatus.OK, command});

    let treeItem = statusTreeData.getTreeItem('task-1') as vscode.TreeItem;
    expect(treeItem.command).toEqual(command);

    statusManager.deleteTask('task-1');
    statusManager.setTask('task-1', {status: TaskStatus.OK});
    treeItem = statusTreeData.getTreeItem('task-1') as vscode.TreeItem;
    expect(treeItem.command).toBeUndefined();
  });

  it('provides TreeItems with command to show an output channel', () => {
    statusManager.setTask('task-1', {
      status: TaskStatus.OK,
      outputChannel: new VoidOutputChannel('channel-1'),
    });

    let treeItem = statusTreeData.getTreeItem('task-1') as vscode.TreeItem;
    const outputChannel = <VoidOutputChannel>treeItem.command?.arguments?.[2];
    expect(outputChannel.name).toEqual('channel-1');

    statusManager.deleteTask('task-1');
    statusManager.setTask('task-1', {status: TaskStatus.OK});
    treeItem = statusTreeData.getTreeItem('task-1') as vscode.TreeItem;
    expect(treeItem.command).toBeUndefined();
  });

  it('updating task status preserves other task data', async () => {
    const command: vscode.Command = {title: '', command: 'command1'};

    statusManager.setTask('task-1', {status: TaskStatus.OK, command});
    statusManager.setStatus('task-1', TaskStatus.ERROR);

    const treeItem = await statusTreeData.getTreeItem('task-1');
    // verify that the command was not changed
    expect(treeItem.command).toEqual(command);
    expect(statusTreeData.getChildren(undefined)).toEqual(['task-1']);
  });
});
