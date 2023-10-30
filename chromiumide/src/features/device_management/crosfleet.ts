// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as dateFns from 'date-fns';
import * as cipd from '../../common/cipd';
import * as commonUtil from '../../common/common_util';
import {UnexpectedCommandBehaviorError} from '../../common/common_util';
import * as outputParsing from '../../common/output_parsing';
import * as shutil from '../../common/shutil';

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

/** Extracts the information available from the `crosfleet dut lease` command.
 *
 * @throws UnexpectedCommandBehaviorError If the information cannot be extracted.
 */
export function parseCrosfleetDutLeaseOutput(
  output: string
): CrosfleetDutLeaseOutput {
  const record = outputParsing.parseMultilineKeyEqualsValue(output);
  const info = {
    dutHostname: record.DUT_HOSTNAME,
    model: record.MODEL,
    board: record.BOARD,
    servoHostname: record.SERVO_HOSTNAME,
    servoPort: Number(record.SERVO_PORT),
    servoSerial: record.SERVO_SERIAL,
  };
  if (
    !info.dutHostname ||
    !info.model ||
    !info.board ||
    !info.servoHostname ||
    !info.servoPort ||
    !info.servoSerial
  ) {
    throw new UnexpectedCommandBehaviorError(
      'Unable to extract complete DUT info from `crosfleet dut lease` output:\n' +
        output
    );
  }
  return info;
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
    private readonly output: vscode.OutputChannel
  ) {
    this.executablePath = new commonUtil.CacheOnSuccess(() =>
      this.cipdRepository.ensureCrosfleet(this.output)
    );
  }

  dispose(): void {
    vscode.Disposable.from(...this.subscriptions).dispose();
  }

  /**
   * Executes the crosfleet CLI with given arguments.
   */
  private async exec(
    args: string[],
    token?: vscode.CancellationToken
  ): ReturnType<typeof commonUtil.exec> {
    const executablePath = await this.executablePath.getOrThrow();
    return await commonUtil.exec(executablePath, args, {
      logger: this.output,
      cancellationToken: token,
    });
  }

  /**
   * Checks if the user is logged into the crosfleet CLI.
   */
  async checkLogin(): Promise<boolean> {
    const result = await this.exec(['whoami']);
    if (result instanceof commonUtil.AbnormalExitError) {
      return false;
    }
    if (result instanceof Error) {
      throw result;
    }
    return true;
  }

  /**
   * Performs the login to the crosfleet CLI by starting a terminal.
   */
  async login(): Promise<void> {
    const executablePath = await this.executablePath.getOrThrow();
    const exitStatus = await runInTerminal(executablePath, ['login'], {
      name: 'crosfleet login',
    });
    if (exitStatus.code !== 0) {
      throw new Error('crosfleet login failed');
    }
    this.onDidChangeEmitter.fire();
  }

  /**
   * Returns a list of leased devices.
   */
  async listLeases(): Promise<LeaseInfo[]> {
    const result = await this.exec(['dut', 'leases', '-json']);
    if (result instanceof Error) {
      throw result;
    }
    return parseLeases(result.stdout);
  }

  /**
   * Requests to lease a new device.
   *
   * @throws UnexpectedCommandBehaviorError
   */
  async requestLease(options: LeaseOptions): Promise<CrosfleetDutLeaseOutput> {
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

    const result = await this.exec(args, options.token);
    if (result instanceof Error) {
      throw result;
    }
    this.onDidChangeEmitter.fire();
    const unorderedOutput = result.stdout + '\n' + result.stderr;
    return parseCrosfleetDutLeaseOutput(unorderedOutput);
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
    const result = await this.exec(['dut', 'abandon', hostname], token);
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

  const command = shutil.escapeArray([name, ...args]);
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

  const leases = [];
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
