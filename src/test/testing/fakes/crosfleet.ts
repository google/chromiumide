// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as path from 'path';
import * as dateFns from 'date-fns';
import {
  AbnormalExitError,
  ExecResult,
} from '../../../../shared/app/common/exec/types';
import * as cipd from '../../../common/cipd';
import * as crosfleet from '../../../features/device_management/crosfleet';
import {arrayWithPrefix} from '../../unit/testing/jasmine/asymmetric_matcher';
import {FakeExec} from '../fake_exec';

export enum GcloudState {
  NOT_INSTALLED,
  NOT_LOGGED_IN,
  OK,
}

export class FakeCrosfleet {
  private loggedIn = true;
  private leases: crosfleet.LeaseInfo[] = [];
  private gcloudState = GcloudState.OK;

  constructor() {}

  setLoggedIn(loggedIn: boolean): void {
    this.loggedIn = loggedIn;
  }

  setLeases(leases: crosfleet.LeaseInfo[]): void {
    this.leases = leases;
  }

  setGcloudState(state: GcloudState): void {
    this.gcloudState = state;
  }

  install(fakeExec: FakeExec, cipdRepository: cipd.CipdRepository): void {
    const crosfleet = path.join(cipdRepository.installDir, 'crosfleet');

    fakeExec
      .withArgs(crosfleet, ['whoami'], jasmine.anything())
      .and.callFake(() => this.handleWhoami());
    fakeExec
      .withArgs(crosfleet, ['dut', 'leases', '-json'], jasmine.anything())
      .and.callFake(() => this.handleLeases());
    fakeExec
      .withArgs(crosfleet, arrayWithPrefix('dut', 'lease'), jasmine.anything())
      .and.callFake((_crosfleet, [_dut, _lease, ...restArgs]) =>
        this.handleLease(restArgs)
      );
    fakeExec
      .withArgs(
        'gcloud',
        [
          'auth',
          'list',
          '--filter',
          'status:Active',
          '--format',
          'value(account)',
        ],
        jasmine.anything()
      )
      .and.callFake(() => this.handleGcloudAuthList());
  }

  private async handleWhoami(): Promise<ExecResult | AbnormalExitError> {
    if (!this.loggedIn) {
      return new AbnormalExitError('crosfleet', ['whoami'], 1, '', '');
    }
    return {exitStatus: 0, stdout: '', stderr: ''};
  }

  private async handleLeases(): Promise<ExecResult | AbnormalExitError> {
    if (!this.loggedIn) {
      return new AbnormalExitError(
        'crosfleet',
        ['dut', 'leases', '-json'],
        1,
        '',
        ''
      );
    }
    const output: crosfleet.CrosfleetLeasesOutput = {
      Leases: this.leases.map(l => {
        const botDimensions = [];
        if (l.board) {
          botDimensions.push({key: 'label-board', value: l.board});
        }
        if (l.model) {
          botDimensions.push({key: 'label-model', value: l.model});
        }
        return {
          DUT: {
            Hostname: l.hostname,
          },
          Build: {
            startTime: l.deadline?.toISOString(),
            input: {
              properties: {
                lease_length_minutes: 0,
              },
            },
            infra: {
              swarming: {
                botDimensions,
              },
            },
          },
        };
      }),
    };
    return {exitStatus: 0, stdout: JSON.stringify(output), stderr: ''};
  }

  private async handleLease(
    restArgs: string[]
  ): Promise<ExecResult | AbnormalExitError> {
    if (!this.loggedIn) {
      return new AbnormalExitError(
        'crosfleet',
        ['dut', 'lease'].concat(restArgs),
        1,
        '',
        ''
      );
    }

    // These are the only supported arguments.
    const validArgs = [
      '-duration',
      '60',
      '-board',
      'board1',
      '-model',
      'model1',
      '-host',
      'host1',
    ];
    const ok = () => {
      if (restArgs.length !== validArgs.length) {
        return false;
      }
      for (let i = 0; i < restArgs.length; i++) {
        if (restArgs[i] !== validArgs[i]) {
          return false;
        }
      }
      return true;
    };
    if (!ok) {
      return new AbnormalExitError(
        'crosfleet',
        ['dut', 'lease'].concat(restArgs),
        1,
        '',
        ''
      );
    }

    this.leases.push({
      hostname: 'host1',
      board: 'board1',
      model: 'model1',
      deadline: dateFns.addMinutes(new Date(), 60),
    });

    return {
      exitStatus: 0,
      stdout: `
    Leased host1 until 21 Oct 22 17:02 PDT

    Visit http://go/chromeos-lab-duts-ssh for up-to-date docs on SSHing to a leased DUT
        `,
      stderr: `
    DUT_HOSTNAME=host1
    MODEL=model1
    BOARD=board1
    SERVO_HOSTNAME=servoHostname1
    SERVO_PORT=9995
    SERVO_SERIAL=S2010291819

    Visit http://go/my-crosfleet to track all of your crosfleet-launched tasks
         `,
    };
  }

  private async handleGcloudAuthList(): Promise<ExecResult | Error> {
    switch (this.gcloudState) {
      case GcloudState.NOT_INSTALLED:
        return new Error('Command not found');
      case GcloudState.NOT_LOGGED_IN:
        return {
          exitStatus: 0,
          stdout: '',
          stderr: '',
        };
      case GcloudState.OK:
        return {
          exitStatus: 0,
          stdout: 'someone@example.com\n',
          stderr: '',
        };
    }
  }
}

/**
 * Installs a fake crosfleet CLI for testing, and returns a FakeCrosfleet
 * that you can use to set the fake CLI's behavior.
 *
 * This function should be called in describe. Returned FakeCrosfleet is
 * reset between tests.
 */
export function installFakeCrosfleet(
  fakeExec: FakeExec,
  cipdRepository: cipd.CipdRepository
): FakeCrosfleet {
  const fakeCrosfleet = new FakeCrosfleet();

  beforeEach(() => {
    Object.assign(fakeCrosfleet, new FakeCrosfleet());
    fakeCrosfleet.install(fakeExec, cipdRepository);
  });

  return fakeCrosfleet;
}
