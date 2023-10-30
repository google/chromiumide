// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as process from 'process';
import * as vscode from 'vscode';
import * as glob from 'glob';
import {ParsedEbuildFilepath} from '../../../../common/chromiumos/portage/ebuild';
import * as commonUtil from '../../../../common/common_util';
import {MemoryOutputChannel} from '../../../../common/memory_output_channel';
import {TeeOutputChannel} from '../../../../common/tee_output_channel';
import * as services from '../../../../services';
import * as config from '../../../../services/config';
import {Metrics} from '../../../metrics/metrics';
import {DeviceClient} from '../../device_client';
import {diagnoseSshError} from '../../diagnostic';
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
  chrootService: services.chromiumos.ChrootService,
  homedir = os.homedir()
): Promise<DebugTastTestsResult | null | Error> {
  Metrics.send({
    category: 'interactive',
    group: 'device',
    name: 'device_management_debug_tast_tests',
    description: 'debug Tast tests',
  });

  const targetFile = vscode.window.activeTextEditor?.document.fileName;
  if (!targetFile) {
    return null;
  }

  const preTestResult = await preTestSetUp(context);
  if (!preTestResult) {
    return null;
  }
  const {hostname, testCase, port} = preTestResult;

  const target = `localhost:${port}`;

  context.output.appendLine('Start Debug Tast Tests');

  const dlvEbuildVersion = getDlvEbuildVersion(chrootService) ?? '1.21.0';

  const dutHasDelve = await ensureDutHasDelve(
    context,
    chrootService,
    hostname,
    dlvEbuildVersion
  );
  if (!dutHasDelve) {
    return null;
  }

  const delveInHost = await ensureHostHasDelve(
    context,
    dlvEbuildVersion,
    homedir
  );
  if (!delveInHost) {
    return null;
  }

  const alternateTools = config.goExtension.alternateTools.get() ?? {};

  if (alternateTools.dlv !== delveInHost) {
    alternateTools.dlv = delveInHost;
    await config.goExtension.alternateTools.update(alternateTools);

    if (config.tast.showGoAlternateToolsChangedMessage.get()) {
      const foreverDismiss = 'Never show this again';

      void (async () => {
        const choice = await vscode.window.showInformationMessage(
          'User settings (go.alternateTools.dlv) was changed to use device-compatible debugger',
          foreverDismiss
        );

        if (choice === foreverDismiss) {
          await config.tast.showGoAlternateToolsChangedMessage.update(false);
        }
      })();
    }
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
    await debugSelectedTests(context, hostname, testNames);
    return new DebugTastTestsResult();
  } catch (err) {
    showPromptWithOpenLogChoice(context, 'Failed to run tests.', true);
    throw err;
  }
}

/**
 * Debug all of the selected tests.
 * This doesn't wait for the completion of the debugging, but returns immediately after the command
 * to start debugging run.
 */
async function debugSelectedTests(
  context: CommandContext,
  hostname: string,
  testNames: string[]
): Promise<void> {
  const dlvPort = 2345;
  const taskType = 'shell';
  const taskName = 'prep debugger';
  const taskSource = 'tast';
  const extraArgs = config.tast.extraArgs.get();
  const prepDebuggerTaskProvider = vscode.tasks.registerTaskProvider(taskType, {
    provideTasks(): vscode.Task[] {
      const task = new vscode.Task(
        {type: taskType},
        vscode.TaskScope.Workspace,
        taskName,
        taskSource,
        new vscode.ShellExecution(
          `cros_sdk tast run -failfortests -attachdebugger=local:${dlvPort} ${extraArgs.join(
            ' '
          )} ${hostname} ${testNames.join(' ')}`
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

  await startDebugging(context, dlvPort, taskName, taskSource);
  prepDebuggerTaskProvider.dispose();
}

async function startDebugging(
  context: CommandContext,
  dlvPort: number,
  taskName: string,
  taskSource: string
): Promise<void> {
  // See https://github.com/golang/vscode-go/wiki/debugging#launchjson-attributes
  // for the meaning of the fields.
  const debugConfiguration: vscode.DebugConfiguration = {
    name: 'Debug tast test',
    type: 'go',
    request: 'attach',
    mode: 'remote',
    port: dlvPort,
    host: '127.0.0.1',
    appVersion: 2,
    preLaunchTask: `${taskSource}: ${taskName}`,
  };

  context.output.appendLine(
    `ChromiumIDE running debugger with the following config: ${JSON.stringify(
      debugConfiguration
    )}`
  );

  const folder = vscode.workspace.workspaceFolders?.[0];

  // TODO(b:298299866): The bug that the debug fails if the user changes the focus after starting debug tests.
  // It doesn't work if the folder is specified to undefined.
  await vscode.debug.startDebugging(folder, debugConfiguration);
}

function getDlvEbuildVersion(
  chrootService: services.chromiumos.ChrootService
): string | undefined {
  const ebuildFileName = glob.glob.sync(
    path.join(
      chrootService.source.root,
      'src/third_party/chromiumos-overlay/dev-go/delve/delve-*.ebuild'
    )
  )[0];

  if (ebuildFileName) {
    try {
      const res = ParsedEbuildFilepath.parseOrThrow(ebuildFileName);
      return res.pkg.version;
    } catch {
      Metrics.send({
        category: 'error',
        group: 'tast',
        name: 'tast_debug_fail_to_get_delve_version_from_ebuild',
        description: 'Tast Debug fail to get delve version from ebuild',
      });
      // return undefined when failing to get delve version from ebuild
    }
  }
  return undefined;
}

function parseDlvVersion(out: string): string | undefined {
  const m = /^Version: (.*)$/m.exec(out);
  return m?.[1];
}

/**
 * Checks if the DUT has the delve binary (the version of delve is same as ebuild), and otherwise builds and deploys delve to the DUT.
 * Returns false if it fails to ensure that the delve is in DUT.
 * https://go/debug-tast-tests#step-1_confirm-that-your-dut-can-run-delve
 *
 * @param context The current command context.
 * @param chrootService The chroot to run commands in.
 * @param hostname DUT's IP
 */
async function ensureDutHasDelve(
  context: CommandContext,
  chrootService: services.chromiumos.ChrootService,
  hostname: string,
  dlvEbuildVersion: string
): Promise<boolean> {
  const args = sshUtil.buildSshCommand(
    hostname,
    context.sshIdentity,
    [],
    'dlv version'
  );

  const memoryOutput = new MemoryOutputChannel();
  const result = await commonUtil.exec(args[0], args.slice(1), {
    logger: new TeeOutputChannel(memoryOutput, context.output),
  });
  // DUT has the delve binary and the version of delve is same as ebuild.
  if (
    !(result instanceof Error) &&
    parseDlvVersion(result.stdout) === dlvEbuildVersion
  ) {
    context.output.appendLine(result.stdout);
    context.output.appendLine(
      'DUT can run dlv (the version is same as ebuild)'
    );
    return true;
  }

  // SSH connection to DUT failed
  if (result instanceof commonUtil.AbnormalExitError) {
    if (result.exitStatus === 255) {
      const err = diagnoseSshError(result, memoryOutput.output);
      context.output.appendLine(err.message);
      const message = 'SSH connection failed: ' + err.message;
      showPromptWithOpenLogChoice(context, message, true);
      return false;
    }
  }

  // DUT does not have the delve binary or the version of delve is different from ebuild.
  context.output.appendLine('Try to get the device board name');
  const deviceClient = new DeviceClient(
    hostname,
    context.sshIdentity,
    context.output
  );
  let board: string;

  try {
    board = (await deviceClient.readLsbRelease()).board;
  } catch (err) {
    context.output.appendLine(`${err}`);
    showPromptWithOpenLogChoice(
      context,
      "debugging didn't start: failed to get board information from DUT",
      true
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
        showPromptWithOpenLogChoice(
          context,
          "debugging didn't start: failed to install the debugger (delve) to the device",
          true
        );
        return false;
      }
      return true;
    }
  );
}

/**
 * Checks if the host machine (outside the chroot) has delve binary in '${HOME}/.cache/chromiumide/go/bin/dlv'  (the version of delve is same as ebuild), and otherwise install it.
 * https://go/debug-tast-tests#step-2_install-the-debugger-on-your-host-machine-outside-the-chroot
 *
 * @returns The path to delve if found or installed. undefined if failed.
 */
async function ensureHostHasDelve(
  context: CommandContext,
  dlvEbuildVersion: string,
  homedir: string
): Promise<string | undefined> {
  const gobin = path.join(homedir, '.cache/chromiumide/go/bin');
  const delveInstallPath = path.join(gobin, 'dlv');
  if (fs.existsSync(delveInstallPath)) {
    const res = await commonUtil.exec(delveInstallPath, ['version'], {
      logger: context.output,
    });

    if (
      !(res instanceof Error) &&
      parseDlvVersion(res.stdout) === dlvEbuildVersion
    ) {
      context.output.appendLine(
        'Host can run dlv (the version is same as ebuild)'
      );
      return delveInstallPath;
    }
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
        ['install', `github.com/go-delve/delve/cmd/dlv@v${dlvEbuildVersion}`],
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
        context.output.append(res.message);
        showPromptWithOpenLogChoice(
          context,
          "debugging didn't start: failed to install the debugger (delve) to the host machine",
          true
        );
        return undefined;
      }
      return delveInstallPath;
    }
  );
}
