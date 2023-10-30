// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as crosfleet from '../../../../../features/device_management/crosfleet';
import * as testing from '../../../../testing';
import * as fakes from '../../../../testing/fakes';

describe('CrosfleetRunner', () => {
  const clock = jasmine.clock();
  beforeEach(() => {
    clock.install();
    clock.mockDate(new Date('2000-01-01T00:00:00Z'));
  });
  afterEach(() => {
    clock.uninstall();
  });

  const {fakeExec} = testing.installFakeExec();
  const cipdRepository = fakes.installFakeCipd(fakeExec);
  const fakeCrosfleet = fakes.installFakeCrosfleet(fakeExec, cipdRepository);
  const state = testing.cleanState(() => {
    const runner = new crosfleet.CrosfleetRunner(
      cipdRepository,
      new fakes.VoidOutputChannel()
    );
    return {runner};
  });

  it('returns a list of leased device', async () => {
    fakeCrosfleet.setLeases([]);
    expect(await state.runner.listLeases()).toEqual([]);

    fakeCrosfleet.setLeases([
      {
        hostname: 'cros111',
        board: 'board1',
        model: 'model1',
        deadline: new Date('2000-01-01T00:01:00Z'),
      },
      {
        hostname: 'cros222',
        board: 'board2',
        model: 'model2',
        deadline: new Date('2000-01-01T00:02:00Z'),
      },
    ]);
    expect(await state.runner.listLeases()).toEqual([
      {
        hostname: 'cros111',
        board: 'board1',
        model: 'model1',
        deadline: new Date('2000-01-01T00:01:00Z'),
      },
      {
        hostname: 'cros222',
        board: 'board2',
        model: 'model2',
        deadline: new Date('2000-01-01T00:02:00Z'),
      },
    ]);
  });

  it('does not return expired leases', async () => {
    fakeCrosfleet.setLeases([]);
    expect(await state.runner.listLeases()).toEqual([]);

    fakeCrosfleet.setLeases([
      {
        hostname: 'cros111',
        board: 'board1',
        model: 'model1',
        deadline: new Date('2000-01-01T00:01:00Z'),
      },
      {
        hostname: 'cros222',
        board: 'board2',
        model: 'model2',
        deadline: new Date('1999-12-31T23:59:59Z'),
      },
    ]);
    expect(await state.runner.listLeases()).toEqual([
      {
        hostname: 'cros111',
        board: 'board1',
        model: 'model1',
        deadline: new Date('2000-01-01T00:01:00Z'),
      },
      // The second lease is not returned as it's already expired.
    ]);
  });

  it('handles the logged-out case', async () => {
    fakeCrosfleet.setLeases([]);

    fakeCrosfleet.setLoggedIn(true);
    expect(await state.runner.checkLogin()).toEqual(true);
    expect(await state.runner.listLeases()).toEqual([]);

    fakeCrosfleet.setLoggedIn(false);
    expect(await state.runner.checkLogin()).toEqual(false);
    await expectAsync(state.runner.listLeases()).toBeRejected();
  });

  it('requests a new lease', async () => {
    expect(await state.runner.listLeases()).toEqual([]);

    await state.runner.requestLease({
      durationInMinutes: 60,
      board: 'board1',
      model: 'model1',
      hostname: 'host1',
    });

    expect(await state.runner.listLeases()).toEqual([
      {
        hostname: 'host1',
        board: 'board1',
        model: 'model1',
        deadline: new Date('2000-01-01T01:00:00Z'),
      },
    ]);
  });
});

describe('crosfleet', () => {
  describe('parseCrosfleetDutLeaseOutput', () => {
    it('parses dut lease output', () => {
      const result = crosfleet.parseCrosfleetDutLeaseOutput(`
Verifying the provided DUT dimensions...
Found 32 DUT(s) (32 busy) matching the provided DUT dimensions
Requesting 5 minute lease at https://ci.chromium.org/ui/p/chromeos/builders/test_runner/dut_leaser/b8799650214213181409
Waiting to confirm DUT lease request validation and print leased DUT details...
(To skip this step, pass the -exit-early flag on future DUT lease commands)
Leased chromeos2-row7-rack7-host43 until 21 Oct 22 17:02 PDT

DUT_HOSTNAME=chromeos2-row7-rack7-host43
MODEL=berknip
BOARD=zork
SERVO_HOSTNAME=chromeos2-row7-rack7-labstation7
SERVO_PORT=9995
SERVO_SERIAL=S2010291819

Visit http://go/chromeos-lab-duts-ssh for up-to-date docs on SSHing to a leased DUT
Visit http://go/my-crosfleet to track all of your crosfleet-launched tasks
`);
      expect(result).toEqual({
        dutHostname: 'chromeos2-row7-rack7-host43',
        model: 'berknip',
        board: 'zork',
        servoHostname: 'chromeos2-row7-rack7-labstation7',
        servoPort: 9995,
        servoSerial: 'S2010291819',
      });
    });

    it('Throws when any expected info is missing', () => {
      const output = `
MODEL=berknip
BOARD=zork
SERVO_HOSTNAME=chromeos2-row7-rack7-labstation7
SERVO_PORT=9995
SERVO_SERIAL=S2010291819
`;
      expect(() => crosfleet.parseCrosfleetDutLeaseOutput(output)).toThrow(
        new Error(
          'Unable to extract complete DUT info from `crosfleet dut lease` output:\n' +
            output
        )
      );
    });
  });
});
