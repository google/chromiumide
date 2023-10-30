// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {
  StatusManager,
  TaskData,
  TaskName,
  TaskStatus,
} from '../../../../ui/bg_task_status';

/**
 * Fake implementation of StatusManager, extendable for testing
 * convenience.
 */
export class FakeStatusManager implements StatusManager {
  private tasks = new Map<TaskName, TaskData>();

  constructor() {}

  setTask(taskName: string, taskData: TaskData): void {
    this.tasks.set(taskName, taskData);
  }

  deleteTask(taskName: string): void {
    this.tasks.delete(taskName);
  }

  setStatus(taskName: string, status: TaskStatus): void {
    const data = this.tasks.get(taskName);
    this.setTask(taskName, {...data, status});
  }

  getStatus(taskName: string): TaskStatus | undefined {
    return this.tasks.get(taskName)?.status;
  }
}
