// Copyright 2022 The ChromiumOS Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {
  StatusManager,
  TaskId,
  TaskStatus,
  TEST_ONLY,
} from '../../../ui/bg_task_status';

const {StatusManagerImpl, StatusBarHandler, StatusTreeData} = TEST_ONLY;

describe('Background Task Status', () => {
  const errorBgColor = new vscode.ThemeColor('statusBarItem.errorBackground');

  function assertShowsError(statusBarItem: vscode.StatusBarItem) {
    expect(statusBarItem).toEqual(
      jasmine.objectContaining({
        text: '$(error) CrOS IDE',
        tooltip: 'Background Tasks (Errors)',
        backgroundColor: errorBgColor,
      })
    );
  }

  function assertShowsOk(statusBarItem: vscode.StatusBarItem) {
    expect(statusBarItem).toEqual(
      jasmine.objectContaining({
        text: '$(check) CrOS IDE',
        tooltip: 'Background Tasks (No Problems)',
        backgroundColor: undefined,
      })
    );
  }

  let statusBarItem: vscode.StatusBarItem;
  let statusManager: StatusManager;
  let statusTreeData: vscode.TreeDataProvider<TaskId>;

  beforeEach(() => {
    statusBarItem = vscode.window.createStatusBarItem();
    statusBarItem.show();
    const statusBarHandler = new StatusBarHandler(statusBarItem);
    // We need an extra const , because there's no onChange in StatusManager.
    const sm = new StatusManagerImpl();
    sm.onChange(statusBarHandler.refresh.bind(statusBarHandler));
    const std = new StatusTreeData();
    sm.onChange(std.refresh.bind(std));
    statusManager = sm;
    statusTreeData = std;
  });

  afterEach(() => {
    statusBarItem.dispose();
  });

  it('changes status bar item when tasks are added and removed', () => {
    assertShowsOk(statusBarItem);

    statusManager.setTask('error-A', {status: TaskStatus.ERROR});
    statusManager.setTask('error-B', {status: TaskStatus.ERROR});
    assertShowsError(statusBarItem);

    statusManager.deleteTask('error-A');
    assertShowsError(statusBarItem);

    statusManager.deleteTask('error-B');
    assertShowsOk(statusBarItem);
  });

  it('allows deleting tasks without adding them first', () => {
    statusManager.deleteTask('delete-before-adding');
    assertShowsOk(statusBarItem);
  });

  it('shows abbreviated status of tasks (running -> errors -> warnings -> ok)', () => {
    statusManager.setTask('running', {status: TaskStatus.RUNNING});
    statusManager.setTask('ok', {status: TaskStatus.OK});
    statusManager.setTask('error', {status: TaskStatus.ERROR});
    expect(statusBarItem).toEqual(
      jasmine.objectContaining({
        text: '$(sync~spin) CrOS IDE',
        backgroundColor: errorBgColor,
      })
    );

    statusManager.deleteTask('running');
    expect(statusBarItem).toEqual(
      jasmine.objectContaining({
        text: '$(error) CrOS IDE',
        backgroundColor: errorBgColor,
      })
    );

    statusManager.deleteTask('error');
    expect(statusBarItem).toEqual(
      jasmine.objectContaining({
        text: '$(check) CrOS IDE',
        backgroundColor: undefined,
      })
    );

    statusManager.deleteTask('ok');
    expect(statusBarItem).toEqual(
      jasmine.objectContaining({
        text: '$(check) CrOS IDE',
        backgroundColor: undefined,
      })
    );
  });

  it('implements TreeDataProvider.getChildren()', () => {
    statusManager.setTask('task-1', {status: TaskStatus.OK});
    statusManager.setTask('task-2', {status: TaskStatus.OK});

    const children = statusTreeData.getChildren(undefined) as TaskId[];
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
});
