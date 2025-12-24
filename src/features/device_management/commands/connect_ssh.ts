// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as commonUtil from '../../../../shared/app/common/common_util';
import {getDriver} from '../../../../shared/app/common/driver_repository';
import {OptionsParser} from '../../../../shared/app/common/parse';
import * as shutil from '../../../../shared/app/common/shutil';
import {
  QuickPickItemWithPrefillButton,
  showInputBoxWithSuggestions,
} from '../../../../shared/app/ui/input_box';
import {MemoryOutputChannel} from '../../../common/memory_output_channel';
import {findProcessUsingPort} from '../../../common/net_util';
import {killGracefully} from '../../../common/processes';
import {TeeOutputChannel} from '../../../common/tee_output_channel';
import {
  createShowLogsButton,
  diagnoseSshError,
  showErrorMessageWithButtons,
} from '../diagnostic';
import * as sshUtil from '../ssh_util';
import {CommandContext, promptKnownHostnameIfNeeded} from './common';

const driver = getDriver();

enum ConnectSshAction {
  CONNECT,
  ABORT,
  EDIT_OPTIONS,
}

/**
 * Run connect to device command.
 *
 * @param withOptions whether or not to let user enter custom options for the connection.
 * The options will be validated before connecting (users can force run the connection on warning).
 * If user exit the prompt the command will not be run at all.
 */
export async function connectToDeviceForShell(
  context: CommandContext,
  selectedHostname?: string,
  withOptions = false,
  optsForTesting?: OptionsForTesting
): Promise<void> {
  driver.metrics.send({
    category: 'interactive',
    group: 'device',
    name: 'device_management_connect_to_device_ssh',
    description: 'connect to device with SSH',
  });

  const hostname = await promptKnownHostnameIfNeeded(
    'Connect to Device',
    selectedHostname,
    context.deviceRepository
  );
  if (!hostname) {
    return;
  }

  let options: string[] | undefined = undefined;
  let action = withOptions
    ? ConnectSshAction.EDIT_OPTIONS
    : ConnectSshAction.CONNECT;
  while (action === ConnectSshAction.EDIT_OPTIONS) {
    options = await promptShellConnectionOptions(
      // If user has entered options previously but was rejected, provide it as the initial value
      // for quick edit.
      options?.join(' '),
      optsForTesting?.onDidShowPickerEmitter
    );
    if (!options) return; // User quited prompt for options, implying they want to abort connection.
    action = await maybeWarnUsedPorts(options, context.output, optsForTesting);
  }
  if (action === ConnectSshAction.ABORT) return;

  // Create a new terminal.
  const terminal = vscode.window.createTerminal(hostname);
  terminal.sendText(
    'exec ' +
      shutil.escapeArray(
        sshUtil.buildSshCommand(hostname, context.sshIdentity, options)
      )
  );
  terminal.show();

  const errorMessageProvider = vscode.window.onDidCloseTerminal(
    async closedTerminal => {
      if (terminal !== closedTerminal) return;

      errorMessageProvider.dispose();

      // ssh exits with the exit status of the remote command or with 255 if an error occurred.
      if (terminal.exitStatus?.code === 255) {
        await checkSshConnection(context, hostname);
      }

      optsForTesting?.onDidFinishEmitter?.fire();
    }
  );
}

/**
 * Checks the SSH connection works. Shows an error message to the user on
 * failure.
 */
async function checkSshConnection(
  context: CommandContext,
  hostname: string
): Promise<void> {
  const args = sshUtil.buildSshCommand(
    hostname,
    context.sshIdentity,
    [],
    'true'
  );

  const memoryOutput = new MemoryOutputChannel();

  const result = await commonUtil.exec(args[0], args.slice(1), {
    logger: new TeeOutputChannel(memoryOutput, context.output),
  });

  if (result instanceof Error) {
    const err = diagnoseSshError(result, memoryOutput.output);

    const message = 'SSH connection failed: ' + err.message;
    context.output.appendLine(message);

    showErrorMessageWithButtons(message, [
      ...err.buttons,
      createShowLogsButton(context.output),
    ]);
  }
}

/**
 * Show input box and ask user to input options for ssh connection. Reprompt if the accepted input
 * is not a valid option.
 *
 * @param initialValue value in inputbox on first prompt. Show placeholder instead if not given.
 *
 * @returns valid parsed options as string[], or undefined if user quits at any point.
 */
async function promptShellConnectionOptions(
  initialValue?: string,
  onDidShowPickerEmitterForTesting?: vscode.EventEmitter<void>
): Promise<string[] | undefined> {
  const presets = [
    new QuickPickItemWithPrefillButton(
      '-L 2222:localhost:22', // label
      undefined,
      'Forward local connections to port 2222 to device port 22' // description
    ),
    new QuickPickItemWithPrefillButton(
      '-L 1234:localhost:1234',
      undefined,
      'Forward local connections to port 1234 to device port 1234'
    ),
  ];
  let title = 'SSH with options';
  let value = initialValue;
  for (;;) {
    const optionsString = await showInputBoxWithSuggestions(
      presets,
      {
        title: title,
        placeholder: 'Enter extra options for the SSH command',
        value: value,
      },
      onDidShowPickerEmitterForTesting
    );
    if (optionsString === undefined) return;

    const options = parseOptions(optionsString.trim() + '\n');
    if (options instanceof Error) {
      // Allow the user to fix the string and try again. Update title to explain the error and use
      // the previously accepted input as initial value.
      title = `Invalid SSH options, please try again: ${options.message}`;
      value = optionsString;
      continue;
    }
    return options;
  }
}

function parseOptions(optionsString: string): string[] | Error {
  const parser = new OptionsParser(optionsString);
  try {
    return parser.parseOrThrow();
  } catch (e) {
    return e as Error;
  }
}

/**
 * Blocks until the user responds if the ports that will be assigned by the options are used.
 *
 * @returns The user's choice of whether we should . undefined if we should run the SSH command, 'edit options' if we
 * should let the user edit the options, and 'give up' if the entire operation should be given up.
 */
async function maybeWarnUsedPorts(
  extraOptions: string[],
  output: vscode.OutputChannel,
  optsForTesting?: OptionsForTesting
): Promise<ConnectSshAction> {
  const ports = [];

  for (let i = 0; i < extraOptions.length - 1; i++) {
    if (extraOptions[i] === '-L') {
      const port = parseInt(extraOptions[i + 1].split(':')[0], 10);
      if (port && !isNaN(port)) {
        ports.push(port);
      }
    }
  }

  for (const port of ports) {
    const proc = await findProcessUsingPort(port, {output});
    if (proc instanceof Error) {
      output.appendLine(`Failed to find a process using port ${port}: ${proc}`);
      continue;
    }
    if (!proc) continue;

    const message = `Port ${port} is already used by ${proc.name}[${proc.pid}].`;

    const KILL_IT = `Kill ${proc.name}` as const;
    const EDIT_OPTIONS = 'Edit options';
    const RUN_ANYWAY = 'Run anyway';

    const choice = await vscode.window.showWarningMessage(
      message,
      {
        modal: true,
      },
      KILL_IT,
      EDIT_OPTIONS,
      RUN_ANYWAY
      // 'Cancel' is added as the last button automatically.
    );
    if (!choice) return ConnectSshAction.ABORT;
    if (choice === EDIT_OPTIONS) return ConnectSshAction.EDIT_OPTIONS;
    if (choice === RUN_ANYWAY) return ConnectSshAction.CONNECT;

    ((_: `Kill ${string}`) => {})(choice); // typecheck

    const killed = await killGracefully(proc, {
      output,
      interval: optsForTesting?.pollInterval,
    });
    if (!killed) return ConnectSshAction.ABORT;
  }

  return ConnectSshAction.CONNECT;
}

type OptionsForTesting = {
  onDidShowPickerEmitter?: vscode.EventEmitter<void>;
  onDidFinishEmitter?: vscode.EventEmitter<void>;
  pollInterval?: number;
};
