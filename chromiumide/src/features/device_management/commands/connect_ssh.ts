// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as commonUtil from '../../../../shared/app/common/common_util';
import {getDriver} from '../../../../shared/app/common/driver_repository';
import * as shutil from '../../../../shared/app/common/shutil';
import {
  QuickPickItemWithPrefillButton,
  showInputBoxWithSuggestions,
} from '../../../../shared/app/ui/input_box';
import {MemoryOutputChannel} from '../../../common/memory_output_channel';
import {OptionsParser} from '../../../common/parse';
import {TeeOutputChannel} from '../../../common/tee_output_channel';
import {
  createShowLogsButton,
  diagnoseSshError,
  showErrorMessageWithButtons,
} from '../diagnostic';
import * as sshUtil from '../ssh_util';
import {CommandContext, promptKnownHostnameIfNeeded} from './common';

const driver = getDriver();

export async function connectToDeviceForShell(
  context: CommandContext,
  selectedHostname?: string,
  extraOptions?: string[],
  onDidFinishForTesting?: vscode.EventEmitter<void>
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

  // Create a new terminal.
  const terminal = vscode.window.createTerminal(hostname);
  terminal.sendText(
    'exec ' +
      shutil.escapeArray(
        sshUtil.buildSshCommand(hostname, context.sshIdentity, extraOptions)
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

      onDidFinishForTesting?.fire();
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

export async function connectToDeviceForShellWithOptions(
  context: CommandContext,
  selectedHostname?: string,
  onDidFinishForTesting?: vscode.EventEmitter<void>
): Promise<void> {
  let initialValue: string | undefined = undefined;
  for (;;) {
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
    const optionsString = await showInputBoxWithSuggestions(presets, {
      title: 'SSH with options',
      placeholder: 'Enter extra options for the SSH command',
      value: initialValue,
    });
    if (optionsString === undefined) return;

    const options = parseOptions(optionsString.trim() + '\n');
    if (options instanceof Error) {
      void vscode.window.showErrorMessage(options.message);
      initialValue = optionsString;
      // Allow the user to fix the string and try again.
      continue;
    }

    await connectToDeviceForShell(
      context,
      selectedHostname,
      options,
      onDidFinishForTesting
    );

    break;
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
