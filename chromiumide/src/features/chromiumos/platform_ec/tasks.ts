// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as services from '../../../services';
import * as bgTaskStatus from '../../../ui/bg_task_status';
import {TaskStatus} from '../../../ui/bg_task_status';
import {STATUS_TASK_NAME, SHOW_LOG_COMMAND} from './constants';

export function activate(
  context: vscode.ExtensionContext,
  statusManager: bgTaskStatus.StatusManager,
  chrootService: services.chromiumos.ChrootService,
  output: vscode.OutputChannel
): void {
  const hostTestTaskProvider = new HostTestTaskProvider(
    chrootService,
    output,
    statusManager
  );

  context.subscriptions.push(
    vscode.tasks.registerTaskProvider(TEST_TASK_TYPE, hostTestTaskProvider)
  );
}

export const TEST_TASK_TYPE = 'platform-ec-host-test';

const CHROOT_SRC = '/mnt/host/source/src/platform/ec';

/** Detects tasks for running host unit tests. */
// TODO(b:236389226): report metrics
export class HostTestTaskProvider implements vscode.TaskProvider {
  tasks?: vscode.Task[];

  constructor(
    private readonly chrootService: services.chromiumos.ChrootService,
    private readonly output: vscode.OutputChannel,
    private readonly statusManager: bgTaskStatus.StatusManager
  ) {}

  async provideTasks(token: vscode.CancellationToken): Promise<vscode.Task[]> {
    if (!this.tasks) {
      this.tasks = await this.getTasks(token);
    }
    return this.tasks;
  }

  /** Lists available tasks when we want to run one directly or store it in tasks.json */
  private async getTasks(
    _token: vscode.CancellationToken
  ): Promise<vscode.Task[]> {
    // TODO(b:236389226): handle cancellation
    const result = await this.chrootService.exec('make', ['print-host-tests'], {
      crosSdkWorkingDir: CHROOT_SRC,
      sudoReason: 'to list platform ec host tests',
      logger: this.output,
      logStdout: true,
    });
    if (result instanceof Error) {
      this.output.append(`Listing tests failed: ${result}`);
      this.statusManager.setTask(STATUS_TASK_NAME, {
        status: TaskStatus.ERROR,
        command: SHOW_LOG_COMMAND,
      });
      return [];
    }
    const targets = result.stdout
      .split('\n')
      // `make print-host-tests` returns build only targets starting with "host-"
      // and build and run tests starting with "run-". We need the latter.
      .filter(name => name.startsWith('run-'));
    const tasks: vscode.Task[] = [];
    for (const target of targets) {
      const taskDefinition = {
        type: TEST_TASK_TYPE,
        target: target,
      };
      const t = new vscode.Task(
        taskDefinition,
        vscode.TaskScope.Workspace,
        target,
        'platform ec',
        this.getShellExecution(target)
      );
      t.problemMatchers.push('$platform-ec-host-unittest');
      tasks.push(t);
    }

    this.statusManager.setTask(STATUS_TASK_NAME, {
      status: TaskStatus.OK,
      command: SHOW_LOG_COMMAND,
    });
    return tasks;
  }

  private getShellExecution(target: string) {
    // getTasks() and resolveTask() trigger sudo, so this command will work too.
    return new vscode.ShellExecution('cros_sdk', [
      '--working-dir',
      CHROOT_SRC,
      'make',
      target,
    ]);
  }

  /** Called when we retrieve a task configured in tasks.json. */
  async resolveTask(
    task: vscode.Task,
    _token: vscode.CancellationToken
  ): Promise<vscode.Task | undefined> {
    const target = task.definition.target;
    if (!target) {
      return undefined;
    }
    // Trigger password prompt if needed.
    await this.chrootService.exec('true', [], {
      sudoReason: 'to run platform EC tests',
    });
    return new vscode.Task(
      task.definition,
      task.scope ?? vscode.TaskScope.Workspace,
      target,
      'platform ec',
      this.getShellExecution(target)
    );
  }
}
