// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as process from 'process';
import * as vscode from 'vscode';
import * as commonUtil from '../../../../common/common_util';
import {MemoryOutputChannel} from '../../../../common/memory_output_channel';
import {TeeOutputChannel} from '../../../../common/tee_output_channel';
import {NoBoardError, getOrSelectTargetBoard} from '../../../../ide_util';
import * as services from '../../../../services';
import {Metrics} from '../../../metrics/metrics';
import {
  createShowLogsButton,
  diagnoseSshError,
  showErrorMessageWithButtons,
} from '../../diagnostic';
import * as sshUtil from '../../ssh_util';
import {CommandContext} from '../common';
import {
  askTestNames,
  preTestSetUp,
  showPromptWithOpenLogChoice,
} from './tast_common';

/**
 * Represents the result of the call to debugTastTests.
 */
export class DebugTastTestsResult {
  constructor() {}
}

/**
 * Prompts a user for tast tests to debug, and runs the selected tests
 * under debugger. Returns null when the tests aren't run.
 * @param context The current command context.
 * @param chrootService The chroot to run commands in.
 */
export async function debugTastTests(
  context: CommandContext,
  chrootService: services.chromiumos.ChrootService
): Promise<DebugTastTestsResult | null | Error> {
  Metrics.send({
    category: 'interactive',
    group: 'device',
    name: 'device_management_debug_tast_tests',
    description: 'debug Tast tests',
  });

  const preTestResult = await preTestSetUp(context);
  if (!preTestResult) {
    return null;
  }
  const {hostname, testCase, port} = preTestResult;

  const target = `localhost:${port}`;

  // TODO(uchiaki): Ensure the target DUT has delve installed.
  // http://go/debug-tast-tests#step-1_confirm-that-your-dut-can-run-delve
  // 1. Check if the target has the dlv binary.
  // 2. If not, build delve inside chroot and deploy it. We can use
  //    `getOrSelectTargetBoard` in `src/ide_util.ts` for getting the `BOARD`
  //    value on the initial implementation.
  context.output.appendLine('Start Debug Tast Tests');
  const dutHasDelve = await ensureDutHasDelve(context, chrootService, hostname);
  if (!dutHasDelve) {
    return null;
  }

  // http://go/debug-tast-tests#step-2_install-the-debugger-on-your-host-machine-outside-the-chroot
  const delveInHost = await ensureHostHasDelve(context);
  if (!delveInHost) {
    return null;
  }

  const testNames = await askTestNames(
    context,
    chrootService,
    hostname,
    target,
    testCase
  );
  if (!testNames) {
    return null;
  }

  try {
    await debugSelectedTests(context, hostname);
    // TODO: Wait to show the prompt until the tests run successfully
    showPromptWithOpenLogChoice(context, 'Tests run successfully.', false);
    return new DebugTastTestsResult();
  } catch (err) {
    showPromptWithOpenLogChoice(context, 'Failed to run tests.', true);
    throw err;
  }
}

/**
 * Debug all of the selected tests.
 */
async function debugSelectedTests(
  context: CommandContext,
  hostname: string
): Promise<void> {
  const taskType = 'shell';

  // TODO: Dispose of the registration after use.
  vscode.tasks.registerTaskProvider(taskType, {
    provideTasks(): vscode.Task[] {
      const task = new vscode.Task(
        {type: taskType},
        vscode.TaskScope.Workspace,
        'prep debugger',
        'tast',
        // TODO: Use the file which was active when the debug command was invoked.
        new vscode.ShellExecution(
          `cros_sdk -- /mnt/host/source/src/platform/tast-tests/tools/run_debugger.py --dut=${hostname} --current-file=\${file}`
        ),
        '$prep-tast-debugger'
      );
      task.isBackground = true;
      return [task];
    },

    resolveTask(task: vscode.Task): vscode.Task {
      return task;
    },
  });

  // See https://github.com/golang/vscode-go/wiki/debugging#launchjson-attributes
  // for the meaning of the fields.
  const debugConfiguration: vscode.DebugConfiguration = {
    name: 'Debug tast test',
    type: 'go',
    request: 'attach',
    mode: 'remote',
    port: 2345, // port number is hard-coded in run_debugger.py
    host: '127.0.0.1',
    appVersion: 2,
    preLaunchTask: 'tast: prep debugger',
  };

  context.output.appendLine(
    `ChromiumIDE running debugger with the following config: ${JSON.stringify(
      debugConfiguration
    )}`
  );

  // TODO: Use the delve we have set up.
  // To do that we should update the "go.alternateTools" setting according to https://github.com/golang/vscode-go/wiki/debugging#manually-install-dlv.
  const folder =
    vscode.workspace.workspaceFolders === undefined
      ? undefined
      : vscode.workspace.workspaceFolders[0];

  // TODO(b:298299866): The bug that the debug fails if the user changes the focus after starting debug tests.
  // It doesn't work if the folder is specified to undefined.
  await vscode.debug.startDebugging(folder, debugConfiguration);
}

/**
 * Checks if the DUT has the delve binary, and otherwise builds and deploys delve to the DUT.
 * Returns false if it fails to ensure that the delve is in DUT.
 *
 * @param context The current command context.
 * @param chrootService The chroot to run commands in.
 * @param hostname DUT's IP
 */
async function ensureDutHasDelve(
  context: CommandContext,
  chrootService: services.chromiumos.ChrootService,
  hostname: string
): Promise<boolean> {
  const args = sshUtil.buildSshCommand(
    hostname,
    context.sshIdentity,
    [],
    'which dlv'
  );

  const memoryOutput = new MemoryOutputChannel();
  const result = await commonUtil.exec(args[0], args.slice(1), {
    logger: new TeeOutputChannel(memoryOutput, context.output),
  });
  // DUT has the delve binary.
  if (!(result instanceof Error)) {
    // TODO(uchiaki): Redeploy delve if the version of delve in DUT and local ebuild mismatch.
    context.output.appendLine(result.stdout);
    context.output.appendLine('DUT can run dlv');
    return true;
  }

  // SSH connection to DUT failed
  if (result instanceof commonUtil.AbnormalExitError) {
    if (result.exitStatus === 255) {
      const err = diagnoseSshError(result, memoryOutput.output);
      context.output.appendLine(err.message);
      const message = 'SSH connection failed: ' + err.message;
      showErrorMessageWithButtons(message, [
        ...err.buttons,
        createShowLogsButton(context.output),
      ]);
      return false;
    }
  }

  // DUT does not have the delve binary.
  context.output.appendLine(result.message);
  context.output.appendLine('Try to get the device board name');
  // TODO: Get the board name from the DUT.
  const board = await getOrSelectTargetBoard(chrootService.chroot);
  if (board instanceof NoBoardError) {
    context.output.appendLine(board.message);
    void vscode.window.showErrorMessage(board.message);
    return false;
  }
  if (board === null) {
    context.output.appendLine('board is null');
    void vscode.window.showErrorMessage(
      "debugging didn't start: board was not selected"
    );
    return false;
  }

  context.output.appendLine(`The device board name: ${board}`);

  // Build delve inside chroot and deploy it to DUT.
  return await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      cancellable: true,
      title: 'build and deploy debugger (delve) to the device',
    },
    async (_progress, token): Promise<boolean> => {
      // Install delve to "/usr/local/bin/dlv".
      const res = await chrootService.exec(
        'sh',
        [
          '-c',
          `emerge-${board} dev-go/delve && cros deploy ${hostname} dev-go/delve --root /usr/local`,
        ],
        {
          sudoReason: 'to build and deploy debugger (delve) to the device',
          logger: context.output,
          cancellationToken: token,
        }
      );
      if (token.isCancellationRequested) {
        return false;
      }
      if (res instanceof Error) {
        context.output.append(res.message);
        void vscode.window.showErrorMessage(
          "debugging didn't start: failed to install the debugger (delve) to the device"
        );
        // TODO: Add a button to open the log. We can use `showErrorMessageWithButtons`.
        return false;
      }
      return true;
    }
  );
}

/**
 * Checks if the host machine (outside the chroot) has delve binary in '${HOME}/.cache/chromiumide/go/bin/dlv', and otherwise install it.
 *
 * @returns The path to delve if found or installed. undefined if failed.
 */
async function ensureHostHasDelve(
  context: CommandContext
): Promise<string | undefined> {
  const gobin = path.join(os.homedir(), '.cache/chromiumide/go/bin');
  const delveInstallPath = path.join(gobin, 'dlv');
  if (fs.existsSync(delveInstallPath)) {
    context.output.appendLine('Host can run dlv');
    return delveInstallPath;
  }

  return await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      cancellable: true,
      title: 'install debugger (delve) to the host machine',
    },
    async (_progress, token): Promise<string | undefined> => {
      const res = await commonUtil.exec(
        'go',
        [
          // TODO: Parse the ebuild file for delve and get the version to use
          'install',
          'github.com/go-delve/delve/cmd/dlv@v1.21.0',
        ],
        {
          logger: context.output,
          cancellationToken: token,
          env: {...process.env, GOBIN: gobin},
        }
      );
      if (token.isCancellationRequested) {
        return undefined;
      }
      if (res instanceof Error) {
        void vscode.window.showErrorMessage(
          "debugging didn't start: failed to install the debugger (delve) to the host machine"
        );
        // TODO: Add a button to open the log. We can use `showErrorMessageWithButtons`.
        return undefined;
      }
      return delveInstallPath;
    }
  );
}
