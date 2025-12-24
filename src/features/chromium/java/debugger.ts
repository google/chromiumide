// Copyright 2025 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as childProcess from 'child_process';
import * as fsPromises from 'fs/promises';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import {exec} from '../../../../shared/app/common/common_util';
import {LanguageServerManager} from './language';

/**
 * The interactive flow was cancelled by dismissing the UI.
 *
 * This error should be handled silently.
 */
class UserCancelledError extends Error {
  constructor() {
    super('The UI was dismissed');
  }
}

/**
 * Handles the top-level error by showing a pop-up.
 */
function handleError(err: unknown): void {
  if (err === undefined || err instanceof UserCancelledError) {
    // Do nothing.
  } else {
    void vscode.window.showErrorMessage(`${err}`);
  }
}

/**
 * Represents an Android process.
 */
interface Process {
  pid: number;
  name: string;
}

/**
 * Represents an ADB device.
 */
interface Device {
  name: string;
  status: string;
}

/**
 * Lists debuggable Android processes running on the specified device.

 * @returns A list of Android processes, sorted by PID.
 */
async function listDebuggableAndroidProcesses(
  adbPath: string,
  deviceName: string,
  output: vscode.OutputChannel
): Promise<Process[] | Error> {
  const psOutput = await exec(
    adbPath,
    ['-s', deviceName, 'shell', 'ps -d -w -o PID=,ARGS='],
    {logger: output}
  );
  if (psOutput instanceof Error) {
    return psOutput;
  }

  // "adb jdwp" hangs after sending PIDs. Set a deadline to workaround it.
  const jdwpOutput = await exec(
    'timeout',
    ['1', adbPath, '-s', deviceName, 'jdwp'],
    {
      logger: output,
      ignoreNonZeroExit: true,
    }
  );
  if (jdwpOutput instanceof Error) {
    return jdwpOutput;
  }

  const debuggablePidSet = new Set(jdwpOutput.stdout.split(/\s+/g).map(Number));

  const processes = [];
  for (let line of psOutput.stdout.trim().split('\n')) {
    line = line.trim();
    const sep = line.indexOf(' ');
    if (sep > 0) {
      const pid = Number(line.substring(0, sep));
      const name = line.substring(sep + 1);
      if (debuggablePidSet.has(pid)) {
        processes.push({
          pid,
          name,
        });
      }
    }
  }
  return processes;
}

/**
 * Lists ADB devices available.
 */
async function listAvailableDevices(
  adbPath: string
): Promise<Device[] | Error> {
  const adbOutput = await exec(adbPath, ['devices']);
  if (adbOutput instanceof Error) {
    return adbOutput;
  }

  const devices = [];
  for (const line of adbOutput.stdout.split('\n').slice(1)) {
    const pos = line.indexOf('\t');
    if (pos >= 0) {
      devices.push({
        name: line.substring(0, pos),
        status: line.substring(pos + 1),
      });
    }
  }

  return devices;
}

/**
 * Prompts the user to choose an ADB device.
 *
 * If there is exactly one device available, it is returned immediately without
 * prompting the user. If there is no available device, undefined is returned
 * immediately.
 *
 * @returns The name of an ADB device chosen, or Error in the case of errors.
 */
async function maybeChooseDevice(adbPath: string): Promise<string | Error> {
  const devices = await listAvailableDevices(adbPath);
  if (devices instanceof Error) {
    return devices;
  }

  if (devices.length === 0) {
    return new Error('No adb device available');
  }
  if (devices.length === 1) {
    // There's exactly one device, do not bother to ask the user.
    return devices[0].name;
  }

  const items = devices.map(device => ({
    label: device.name,
    description: device.status,
  }));
  const item = await vscode.window.showQuickPick(items, {
    title: 'Pick a device',
  });
  if (!item) {
    return new UserCancelledError();
  }
  return item.label;
}

/**
 * Ensures that the device is alive.
 *
 * @returns Error in the case of error; otherwise undefined.
 */
async function ensureDeviceIsAlive(
  adbPath: string,
  deviceName: string,
  output: vscode.OutputChannel
): Promise<undefined | Error> {
  const result = await exec(
    'timeout',
    ['3', adbPath, '-s', deviceName, 'shell', 'true'],
    {
      logger: output,
    }
  );
  if (result instanceof Error) {
    return new Error(`${deviceName} is down: ${result}`);
  }
  return undefined;
}

/**
 * Interactively sets up JDWP port forwarding from a local TCP port to a
 * remote Android process.
 *
 * @returns The local TCP port number forwarded, or Error in the case of
 * errors.
 */
async function setUpJdwpForwarding(
  srcDir: string,
  output: vscode.OutputChannel
): Promise<number | Error> {
  // TODO: Consider allocating a port dynamically.
  const PORT = 5028;

  // TODO: Make the adb path configurable.
  const adbPath = path.join(
    srcDir,
    'third_party/android_sdk/public/platform-tools/adb'
  );

  const deviceName = await maybeChooseDevice(adbPath);
  if (deviceName instanceof Error) {
    return deviceName;
  }

  const aliveResult = await ensureDeviceIsAlive(adbPath, deviceName, output);
  if (aliveResult instanceof Error) {
    return aliveResult;
  }

  const processes = await listDebuggableAndroidProcesses(
    adbPath,
    deviceName,
    output
  );
  if (processes instanceof Error) {
    return processes;
  }
  if (processes.length === 0) {
    return new Error(`No debuggable process running on ${deviceName}`);
  }

  processes.reverse(); // Show recent processes first.
  const choice = await vscode.window.showQuickPick(
    processes.map(process => ({
      label: process.name,
      description: process.pid.toString(10),
      process,
    })),
    {
      title: 'Pick a process to attach to',
    }
  );
  if (!choice) {
    return new UserCancelledError();
  }

  const removeForwardResult = await exec(
    adbPath,
    ['-s', deviceName, 'forward', '--remove', `tcp:${PORT}`],
    {
      logger: output,
      ignoreNonZeroExit: true,
    }
  );
  if (removeForwardResult instanceof Error) {
    return removeForwardResult;
  }

  const forwardResult = await exec(
    adbPath,
    ['-s', deviceName, 'forward', `tcp:${PORT}`, `jdwp:${choice.process.pid}`],
    {logger: output}
  );
  if (forwardResult instanceof Error) {
    return forwardResult;
  }

  return PORT;
}

class ChromiumAndroidDebugConfigurationProvider
  implements vscode.DebugConfigurationProvider
{
  constructor(
    private readonly srcDir: string,
    private readonly manager: LanguageServerManager,
    private readonly output: vscode.OutputChannel
  ) {}

  async resolveDebugConfigurationWithSubstitutedVariables(
    _folder: vscode.WorkspaceFolder | undefined,
    debugConfiguration: vscode.DebugConfiguration,
    _token?: vscode.CancellationToken
  ): Promise<vscode.DebugConfiguration | undefined> {
    const config = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Watiing for Java language server startup...',
      },
      () => this.manager.getCompilerConfig()
    );
    if (!config) {
      void vscode.window.showErrorMessage(
        'Java language server is inactive; open a Java file to start it'
      );
      return undefined;
    }

    // If the JDWP port is not specified in the config, show an interactive UI to set up forwarding.
    if (!debugConfiguration.port) {
      const forwardedPort = await setUpJdwpForwarding(this.srcDir, this.output);
      if (forwardedPort instanceof Error) {
        handleError(forwardedPort);
        return undefined;
      }
      debugConfiguration.port = forwardedPort;
    }

    debugConfiguration.sourceRoots = config.sourcePaths;
    return debugConfiguration;
  }
}

class ChromiumDebugAdapterDescriptorFactory
  implements vscode.DebugAdapterDescriptorFactory
{
  constructor(
    private readonly srcDir: string,
    private readonly extensionDir: string,
    private readonly output: vscode.OutputChannel
  ) {}

  async createDebugAdapterDescriptor(
    _session: vscode.DebugSession,
    _executable: vscode.DebugAdapterExecutable | undefined
  ): Promise<vscode.DebugAdapterNamedPipeServer | undefined> {
    // Create a UNIX domain socket and run the debug server with stdin/stdout connected to the
    // socket. This eases debugging the debug server itself by passing through stderr to the output
    // channel.
    const tempDir = await fsPromises.mkdtemp(
      path.join(os.tmpdir(), 'chromiumide.java-debugger.')
    );
    try {
      const socketPath = path.join(tempDir, 'socket');
      await new Promise<void>((resolve, reject) => {
        const server = net.createServer(socket => {
          const child = childProcess.spawn(
            './helpers/start-java-debug-server.sh',
            [],
            {
              cwd: this.extensionDir,
              env: {
                ...process.env,
                JAVA_HOME: path.join(this.srcDir, 'third_party/jdk/current'),
              },
              stdio: [socket, socket, 'pipe'],
            }
          );
          child.on('error', err => {
            this.output.appendLine(
              `Java debugger (PID=${child.pid}) failed: ${err}`
            );
          });
          child.on('close', (code, signal) => {
            this.output.appendLine(
              `Java debugger (PID=${child.pid}) exited with code=${code}, signal=${signal}`
            );
          });
          child.stderr.on('data', data => {
            this.output.append(data.toString('utf8'));
          });
          this.output.appendLine(`Java debugger (PID=${child.pid}) started`);
        });
        server.on('error', reject);
        server.listen(socketPath, () => {
          this.output.appendLine(
            `Java debugger socket created at ${socketPath}`
          );
          resolve();
        });
      });
      return new vscode.DebugAdapterNamedPipeServer(socketPath);
    } catch (err) {
      handleError(err);
      return undefined;
    } finally {
      void fsPromises.rm(tempDir, {recursive: true});
    }
  }
}

export function activateDebugger(
  context: vscode.ExtensionContext,
  srcDir: string,
  manager: LanguageServerManager,
  output: vscode.OutputChannel
): void {
  context.subscriptions.push(
    vscode.debug.registerDebugConfigurationProvider(
      'android.chromium',
      new ChromiumAndroidDebugConfigurationProvider(srcDir, manager, output)
    )
  );

  context.subscriptions.push(
    vscode.debug.registerDebugAdapterDescriptorFactory(
      'android.chromium',
      new ChromiumDebugAdapterDescriptorFactory(
        srcDir,
        context.extensionPath,
        output
      )
    )
  );
}
