// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {vscodeRegisterCommand} from '../common/vscode/commands';
import {Metrics} from '../features/metrics/metrics';

/**
 * Shows `OutputChannel` attached to a tree item. Arguments:
 *   `taskName` - name of the task whose status will be shown
 *   `taskStatus` - enum describing the status of the task
 *   `outputChannel` - output channel that will be focused in the UI
 */
const STATUS_TREE_ITEM_CLICKED = 'chromiumide.status-tree-item-clicked';

/**
 * Manages UI elements showing task status: two status bar items, which are created here,
 * and `chromiumide-status` view, which is defined in `package.json`.
 *
 * @returns `StatusManager` which allows other packages to create tasks with a status.
 */
export function activate(context: vscode.ExtensionContext): StatusManager {
  const showIdeStatusCommand = 'chromiumide.showIdeStatus';
  context.subscriptions.push(
    vscodeRegisterCommand(showIdeStatusCommand, () => {
      void vscode.commands.executeCommand('chromiumide-status.focus');
      Metrics.send({
        category: 'interactive',
        group: 'idestatus',
        description: 'show ide status',
        name: 'idestatus_show_ide_status',
      });
    }),
    vscodeRegisterCommand(
      STATUS_TREE_ITEM_CLICKED,
      (
        taskName: string,
        taskStatus: TaskStatus,
        outputChannel?: vscode.OutputChannel
      ) => {
        if (outputChannel) {
          outputChannel.show();
        }
        Metrics.send({
          category: 'interactive',
          group: 'idestatus',
          description: 'show log for ' + taskName,
          name: 'idestatus_show_task_log',
          task_status: TaskStatus[taskStatus], // string representation of the enum
        });
      }
    )
  );

  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right
  );
  statusBarItem.command = showIdeStatusCommand;
  statusBarItem.show();

  const progressItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left
  );
  progressItem.command = 'chromiumide-status.focus';

  context.subscriptions.push(statusBarItem, progressItem);

  const statusManager = new StatusManagerImpl();

  const statusBarHandler = new StatusBarHandler(statusBarItem, progressItem);
  statusManager.onChange(statusBarHandler.refresh.bind(statusBarHandler));

  const statusTreeData = new StatusTreeData();
  statusManager.onChange(statusTreeData.refresh.bind(statusTreeData));
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('chromiumide-status', statusTreeData)
  );

  return statusManager;
}

export enum TaskStatus {
  OK,
  ERROR,
  RUNNING,
}

function getIcon(ts: TaskStatus): string {
  switch (ts) {
    case TaskStatus.OK:
      return 'check';
    case TaskStatus.ERROR:
      return 'error';
    case TaskStatus.RUNNING:
      return 'sync~spin';
  }
}

export type TaskName = string;

export interface TaskData {
  status: TaskStatus;

  /**
   * Command to be executed when the task is clicked in the UI. It can, for instance,
   * open a UI panel with logs.
   *
   * @deprecated use `outputChannel` instead
   */
  command?: vscode.Command;

  /**
   * Log channel to be opened when the task is clicked in the UI.
   *
   * It is ignored if `command` is set.
   */
  outputChannel?: vscode.OutputChannel;

  /**
   * The context value to set for the tree item.
   */
  contextValue?: string;
}

/**
 * Reports the status of background tasks indicating if the IDE works well or not.
 * It is meant for continuously running background tasks, which should not overuse popups.
 *
 * The status is shown in an abbreviated for in the status bar. Clicking on the status bar item
 * takes the user to a longer view, with a detailed view of all available tasks.
 *
 * Tasks are identified by a human-readable `TaskName`, which is display in various UI locations.
 */
export interface StatusManager {
  setTask(taskName: TaskName, taskData: TaskData): void;
  deleteTask(taskName: TaskName): void;
  setStatus(taskName: TaskName, status: TaskStatus): void;
}

type ChangeHandler = (arg: StatusManagerImpl) => void;

class StatusManagerImpl implements StatusManager {
  private tasks = new Map<TaskName, TaskData>();
  private handlers: ChangeHandler[] = [];

  setTask(taskName: TaskName, taskData: TaskData): void {
    this.tasks.set(taskName, taskData);
    this.handleChange();
  }

  deleteTask(taskName: TaskName): void {
    this.tasks.delete(taskName);
    this.handleChange();
  }

  setStatus(taskName: TaskName, status: TaskStatus): void {
    const data = this.tasks.get(taskName);
    this.setTask(taskName, {...data, status});
  }

  getTasks(): TaskName[] {
    return Array.from(this.tasks.keys());
  }

  getTaskData(taskName: TaskName): TaskData | undefined {
    return this.tasks.get(taskName);
  }

  private get(status: TaskStatus): TaskName[] {
    const taskNames = [];
    for (const [id, data] of this.tasks) {
      if (data.status === status) {
        taskNames.push(id);
      }
    }
    return taskNames;
  }

  getErrorTasks(): TaskName[] {
    return this.get(TaskStatus.ERROR);
  }

  getRunningTasks(): TaskName[] {
    return this.get(TaskStatus.RUNNING);
  }

  onChange(handler: ChangeHandler): void {
    this.handlers.push(handler);
    handler(this);
  }

  handleChange(): void {
    for (const handler of this.handlers) {
      handler(this);
    }
  }
}

class StatusBarHandler {
  constructor(
    private readonly statusBarItem: vscode.StatusBarItem,
    private readonly progressItem: vscode.StatusBarItem
  ) {}

  /**
   * Adjusts appearance of the status bar items based on status of tasks.
   *
   * The background of the main status bar item is determined by the presence of errors.
   *
   * If there are running tasks, then they are shown as a separate item
   * with a spinner icon.
   */
  refresh(statusManagerImpl: StatusManagerImpl): void {
    const errorTasks = statusManagerImpl.getErrorTasks();
    if (errorTasks.length) {
      this.statusBarItem.text = `$(${getIcon(TaskStatus.ERROR)}) ChromiumIDE`;
      this.statusBarItem.backgroundColor = new vscode.ThemeColor(
        'statusBarItem.errorBackground'
      );
      this.statusBarItem.tooltip = `Errors: ${errorTasks.sort().join(', ')}`;
    } else {
      this.statusBarItem.text = `$(${getIcon(TaskStatus.OK)}) ChromiumIDE`;
      this.statusBarItem.backgroundColor = undefined;
      this.statusBarItem.tooltip = 'No Problems';
    }

    const runningTasks = statusManagerImpl.getRunningTasks();
    if (runningTasks.length) {
      const icon = getIcon(TaskStatus.RUNNING);
      const list = runningTasks.sort().join(', ');
      this.progressItem.text = `$(${icon}) Running ${list}...`;
      this.progressItem.show();
    } else {
      this.progressItem.hide();
    }
  }
}

class StatusTreeData implements vscode.TreeDataProvider<TaskName> {
  private statusManagerImpl?: StatusManagerImpl;

  private onDidChangeTreeDataEmitter = new vscode.EventEmitter<
    TaskName | undefined | null | void
  >();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  getTreeItem(element: TaskName): vscode.TreeItem | Thenable<vscode.TreeItem> {
    const statusManagerImp = this.statusManagerImpl!;
    const taskData = statusManagerImp.getTaskData(element)!;
    return new TaskTreeItem(
      element,
      taskData.status,
      taskData.command,
      taskData.outputChannel,
      taskData.contextValue
    );
  }

  getChildren(_element?: TaskName): vscode.ProviderResult<TaskName[]> {
    return this.statusManagerImpl!.getTasks();
  }

  refresh(statusManagerImpl: StatusManagerImpl): void {
    this.statusManagerImpl = statusManagerImpl;
    this.onDidChangeTreeDataEmitter.fire();
  }
}

class TaskTreeItem extends vscode.TreeItem {
  constructor(
    readonly title: string,
    status: TaskStatus,
    command?: vscode.Command,
    outputChannel?: vscode.OutputChannel,
    contextValue?: string
  ) {
    super(title, vscode.TreeItemCollapsibleState.None);

    this.contextValue = contextValue;

    this.iconPath = new vscode.ThemeIcon(getIcon(status));
    if (command) {
      this.command = command;
    } else if (outputChannel) {
      this.command = {
        title: 'Show Details',
        command: STATUS_TREE_ITEM_CLICKED,
        arguments: [title, status, outputChannel],
      };
    }
  }
}

export const TEST_ONLY = {
  StatusManagerImpl,
  StatusBarHandler,
  StatusTreeData,
};
