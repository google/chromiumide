// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as path from 'path';
import * as dateFns from 'date-fns';
import * as cipd from '../../../common/cipd';
import * as commonUtil from '../../../common/common_util';
import * as crosfleet from '../../../features/device_management/crosfleet';
import {arrayWithPrefix} from '../../unit/testing/jasmine/asymmetric_matcher';
import {FakeExec} from '../fake_exec';

export class FakeCrosfleet {
  private loggedIn = true;
  private leases: crosfleet.LeaseInfo[] = [];

  constructor() {}

  setLoggedIn(loggedIn: boolean): void {
    this.loggedIn = loggedIn;
  }

  setLeases(leases: crosfleet.LeaseInfo[]): void {
    this.leases = leases;
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
  }

  private async handleWhoami(): Promise<
    commonUtil.ExecResult | commonUtil.AbnormalExitError
  > {
    if (!this.loggedIn) {
      return new commonUtil.AbnormalExitError(
        'crosfleet',
        ['whoami'],
        1,
        '',
        ''
      );
    }
    return {exitStatus: 0, stdout: '', stderr: ''};
  }

  private async handleLeases(): Promise<
    commonUtil.ExecResult | commonUtil.AbnormalExitError
  > {
    if (!this.loggedIn) {
      return new commonUtil.AbnormalExitError(
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
  ): Promise<commonUtil.ExecResult | commonUtil.AbnormalExitError> {
    if (!this.loggedIn) {
      return new commonUtil.AbnormalExitError(
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
      return new commonUtil.AbnormalExitError(
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
    Verifying the provided DUT dimensions...
    Found 32 DUT(s) (32 busy) matching the provided DUT dimensions
    Requesting 5 minute lease at https://ci.chromium.org/ui/p/chromeos/builders/test_runner/dut_leaser/b8799650214213181409
    Waiting to confirm DUT lease request validation and print leased DUT details...
    (To skip this step, pass the -exit-early flag on future DUT lease commands)
    Leased host1 until 21 Oct 22 17:02 PDT

    DUT_HOSTNAME=host1
    MODEL=model1
    BOARD=board1
    SERVO_HOSTNAME=servoHostname1
    SERVO_PORT=9995
    SERVO_SERIAL=S2010291819

    Visit http://go/chromeos-lab-duts-ssh for up-to-date docs on SSHing to a leased DUT
    Visit http://go/my-crosfleet to track all of your crosfleet-launched tasks
        `,
      stderr: '',
    };
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
