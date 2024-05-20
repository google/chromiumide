// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import * as dateFns from 'date-fns';
import * as commonUtil from '../../../shared/app/common/common_util';
import {getDriver} from '../../../shared/app/common/driver_repository';
import {AbnormalExitError} from '../../../shared/app/common/exec/types';
import * as shutil from '../../../shared/app/common/shutil';
import * as cipd from '../../common/cipd';
import {isGoogler} from '../../driver/metrics/metrics_util';

const driver = getDriver();

/**
 * Represents a leased device.
 */
export interface LeaseInfo {
  readonly hostname: string;
  readonly board: string | undefined;
  readonly model: string | undefined;
  readonly deadline: Date | undefined;
}

/**
 * Contains various options to lease a new device.
 */
export interface LeaseOptions {
  // Optional CancellationToken to cancel the leasing operation.
  readonly token?: vscode.CancellationToken;

  // Duration of a lease in minutes.
  readonly durationInMinutes: number;

  // Criteria to filter devices.
  readonly board?: string;
  readonly model?: string;
  readonly hostname?: string;
}

/** Information available from the `crosfleet dut lease` command. */
export type CrosfleetDutLeaseOutput = {
  readonly dutHostname: string;
  readonly model: string;
  readonly board: string;
  readonly servoHostname: string;
  readonly servoPort: number;
  readonly servoSerial: string;
};

enum GcloudCheckResult {
  NEEDS_INSTALL,
  NEEDS_LOGIN,
  OK,
}

/**
 * Ensures a fake cipd binary in a directory and returns the directory path.
 * The path can be set as the PATH on running crosfleet to ensure it does not self-update.
 */
async function ensureFakeCipd(): Promise<string> {
  const fakeCipdInstallDir = path.join(
    os.homedir(),
    '.cache/chromiumide/fake_cipd'
  );

  await fs.promises.mkdir(fakeCipdInstallDir, {recursive: true});
  await fs.promises.writeFile(
    path.join(fakeCipdInstallDir, 'cipd'),
    '#!/bin/false'
  );
  await fs.promises.chmod(path.join(fakeCipdInstallDir, 'cipd'), 0o755);
  return fakeCipdInstallDir;
}

/**
 * Wraps the crosfleet CLI.
 */
export class CrosfleetRunner {
  private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this.onDidChangeEmitter.event;

  private readonly subscriptions: vscode.Disposable[] = [
    this.onDidChangeEmitter,
  ];

  /**
   * File path to crosfleet CLI.
   *
   * Wrapping the code in CacheOnSuccess ensures that we avoid repeatedly
   * downloading the tool, while allowing for retries on error.
   */
  private executablePath: commonUtil.CacheOnSuccess<string>;

  constructor(
    private readonly cipdRepository: cipd.CipdRepository,
    private readonly output: vscode.OutputChannel,
    private readonly outputBackground: vscode.OutputChannel
  ) {
    this.executablePath = new commonUtil.CacheOnSuccess(() =>
      this.cipdRepository.ensureCrosfleet(this.outputBackground)
    );
  }

  dispose(): void {
    vscode.Disposable.from(...this.subscriptions).dispose();
  }

  /**
   * Executes the crosfleet CLI with given arguments.
   *
   * @param background True if the command is a background operation not triggered by the user.
   */
  private async exec(
    args: string[],
    background: boolean,
    token?: vscode.CancellationToken
  ): ReturnType<typeof commonUtil.exec> {
    const executablePath = await this.executablePath.getOrThrow();
    const fakeCipdDirectory = await ensureFakeCipd();
    const envPath = `${fakeCipdDirectory}:${await driver.getUserEnvPath()}`;
    return await commonUtil.exec(executablePath, args, {
      logger: background ? this.outputBackground : this.output,
      cancellationToken: token,
      env: {
        ...process.env, // for crosfleet to locate credentials via HOME
        PATH: envPath,
      },
    });
  }

  /**
   * Checks if the user is logged into the crosfleet CLI.
   */
  async checkLogin(): Promise<boolean> {
    if (
      (await this.checkGcloud(this.outputBackground)) !== GcloudCheckResult.OK
    ) {
      return false;
    }

    const result = await this.exec(['whoami'], /* background = */ true);
    if (result instanceof AbnormalExitError) {
      return false;
    }
    if (result instanceof Error) {
      throw result;
    }
    return true;
  }

  private async checkGcloud(
    logger: vscode.OutputChannel
  ): Promise<GcloudCheckResult> {
    const result = await commonUtil.exec(
      'gcloud',
      [
        'auth',
        'list',
        '--filter',
        'status:Active',
        '--format',
        'value(account)',
      ],
      {
        logger,
      }
    );
    if (result instanceof Error) {
      return GcloudCheckResult.NEEDS_INSTALL;
    }
    if (result.stdout === '') {
      return GcloudCheckResult.NEEDS_LOGIN;
    }
    return GcloudCheckResult.OK;
  }

  /**
   * Performs the login to the crosfleet CLI by starting a terminal.
   */
  async login(): Promise<undefined | Error> {
    switch (await this.checkGcloud(this.output)) {
      case GcloudCheckResult.NEEDS_INSTALL: {
        // Show a popup to ask the user to install gcloud.
        const url = (await isGoogler())
          ? 'https://goto.google.com/gcloud-cli#installing-and-using-the-cloud-sdk'
          : 'https://cloud.google.com/sdk/docs/install';
        void vscode.window.showErrorMessage(
          `You need to install gcloud following [this guide](${url}) to manage leases.`
        );
        return;
      }
      case GcloudCheckResult.NEEDS_LOGIN: {
        // Run "gcloud auth login".
        const exitStatus = await runInTerminal('gcloud', ['auth', 'login'], {
          name: 'gcloud auth login',
        });
        if (exitStatus.code !== 0) {
          return new Error('gcloud auth login failed');
        }
        // Continue to crosfleet login.
        break;
      }
      case GcloudCheckResult.OK:
        break;
    }

    // The user may hit this path when they've just set up gcloud and clicked the login message
    // while they already logged into crosfleet. In this case we don't need to show the login
    // flow again, so just emit onDidChange to update UI.
    if (!((await this.exec(['whoami'], false)) instanceof Error)) {
      this.onDidChangeEmitter.fire();
      return;
    }

    // Run "crosfleet login".
    const executablePath = await this.executablePath.getOrThrow();
    const exitStatus = await runInTerminal(executablePath, ['login'], {
      name: 'crosfleet login',
    });
    if (exitStatus.code !== 0) {
      return new Error('crosfleet login failed');
    }
    this.onDidChangeEmitter.fire();
  }

  /**
   * Returns a list of leased devices.
   */
  async listLeases(): Promise<LeaseInfo[]> {
    const result = await this.exec(
      ['dut', 'leases', '-json'],
      /* background = */ true
    );
    if (result instanceof Error) {
      throw result;
    }
    return parseLeases(result.stdout);
  }

  /**
   * Requests to lease a new device and returns its hostname on success.
   *
   * @throws Error on command execution failure
   */
  async requestLeaseOrThrow(
    options: LeaseOptions
  ): Promise<string | undefined> {
    const args = [
      'dut',
      'lease',
      '-minutes',
      String(options.durationInMinutes),
    ];
    if (options.board) {
      args.push('-board', options.board);
    }
    if (options.model) {
      args.push('-model', options.model);
    }
    if (options.hostname) {
      args.push('-host', options.hostname);
    }

    const result = await this.exec(
      args,
      /* background = */ false,
      options.token
    );
    if (result instanceof Error) {
      throw result;
    }
    this.onDidChangeEmitter.fire();

    // The new lease info is printed to stderr, see
    // https://source.corp.google.com/h/chromium/infra/infra_superproject/+/main:infra/go/src/infra/cmd/crosfleet/internal/dut/lease.go
    const hostnameMatch = result.stderr.match(/DUT_HOSTNAME=(.*)/);
    return hostnameMatch ? hostnameMatch[1] : undefined;
  }

  /**
   * Abandon a device.
   *
   * Abandoning a device is an asynchronous operation, so `crosflee dut leases`
   * will return it for a few minutes after this operation finishes.
   */
  async abandonLease(
    hostname: string,
    token?: vscode.CancellationToken
  ): Promise<void> {
    const result = await this.exec(
      ['dut', 'abandon', hostname],
      /* background = */ false,
      token
    );
    if (result instanceof Error) {
      throw result;
    }

    this.onDidChangeEmitter.fire();
  }
}

/**
 * Runs a command in a new terminal and waits for its completion.
 */
async function runInTerminal(
  name: string,
  args: string[],
  options: vscode.TerminalOptions = {}
): Promise<vscode.TerminalExitStatus> {
  const fakeCipdDirectory = await ensureFakeCipd();
  const envPath = `${fakeCipdDirectory}:${await driver.getUserEnvPath()}`;
  const terminal = vscode.window.createTerminal(options);

  const waitClose = new Promise<void>(resolve => {
    const subscription = vscode.window.onDidCloseTerminal(closedTerminal => {
      if (closedTerminal === terminal) {
        subscription.dispose();
        resolve();
      }
    });
  });

  terminal.show();

  // Setting env as an option of `vscode.window.createTerminal` doesn't work (b:333294399).
  const command = shutil.escapeArray(['env', `PATH=${envPath}`, name, ...args]);
  terminal.sendText('exec ' + command);

  await waitClose;
  return terminal.exitStatus!;
}

// Schema of the output of "crosfleet dut leases -json".
export interface CrosfleetLeasesOutput {
  Leases?: {
    DUT?: {
      Hostname?: string;
    };
    Build?: {
      startTime?: string;
      input?: {
        properties?: {
          lease_length_minutes?: number;
        };
      };
      infra?: {
        swarming?: {
          botDimensions?: {
            key: string;
            value: string;
          }[];
        };
      };
    };
  }[];
}

function parseLeases(output: string): LeaseInfo[] {
  const parsed = JSON.parse(output) as CrosfleetLeasesOutput;
  if (!parsed.Leases) {
    return [];
  }

  const leases: LeaseInfo[] = [];
  for (const l of parsed.Leases) {
    // Hostname can be missing if a swarming task is still pending.
    const hostname = l.DUT?.Hostname;
    if (!hostname) {
      continue;
    }

    let deadline: Date | undefined;
    if (
      l.Build?.startTime !== undefined &&
      l.Build?.input?.properties?.lease_length_minutes !== undefined
    ) {
      deadline = dateFns.add(new Date(l.Build.startTime), {
        minutes: l.Build.input.properties.lease_length_minutes,
      });
      // Do not return expired leases.
      if (dateFns.isBefore(deadline, new Date())) {
        continue;
      }
    }

    const botDimensions = new Map(
      (l.Build?.infra?.swarming?.botDimensions ?? []).map(d => [d.key, d.value])
    );

    leases.push({
      hostname,
      board: botDimensions.get('label-board'),
      model: botDimensions.get('label-model'),
      deadline,
    });
  }
  return leases;
}
