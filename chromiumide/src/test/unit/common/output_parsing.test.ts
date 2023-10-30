// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as outputParsing from '../../../common/output_parsing';

describe('Output Parsing', () => {
  describe('parseMultilineKeyEqualsValue', () => {
    it('Finds all key/value pairs separated by =', () => {
      const result = outputParsing.parseMultilineKeyEqualsValue(`
Verifying the provided DUT dimensions...
Found 35 DUT(s) (35 busy) matching the provided DUT dimensions
Requesting 5 minute lease at https://ci.chromium.org/ui/p/chromeos/builders/test_runner/dut_leaser/b8799596395727649617
Waiting to confirm DUT lease request validation and print leased DUT details...
(To skip this step, pass the -exit-early flag on future DUT lease commands)
Leased chromeos2-row7-rack7-host18 until 22 Oct 22 07:18 PDT

DUT_HOSTNAME=chromeos2-row7-rack7-host18
MODEL=berknip
BOARD=zork
SERVO_HOSTNAME=chromeos2-row7-rack7-labstation3
SERVO_PORT=9994
SERVO_SERIAL=S2010292255

Visit http://go/chromeos-lab-duts-ssh for up-to-date docs on SSHing to a leased DUT
Visit http://go/my-crosfleet to track all of your crosfleet-launched tasks
            `);
      expect(result).toEqual({
        DUT_HOSTNAME: 'chromeos2-row7-rack7-host18',
        MODEL: 'berknip',
        BOARD: 'zork',
        SERVO_HOSTNAME: 'chromeos2-row7-rack7-labstation3',
        SERVO_PORT: '9994',
        SERVO_SERIAL: 'S2010292255',
      });
    });

    it('Trims keys and values, including when line is indented', () => {
      const result = outputParsing.parseMultilineKeyEqualsValue(`
blabla
  MODEL=berknip
  BOARD  =  zork
blublu
            `);
      expect(result).toEqual({
        MODEL: 'berknip',
        BOARD: 'zork',
      });
    });

    it('Returns an empty record when there are no key-value pairs', () => {
      const result = outputParsing.parseMultilineKeyEqualsValue(`
blabla
blublu
            `);
      expect(result).toEqual({});
    });

    it('Splits key-value on first = and includes remaining =s in the value', () => {
      const result =
        outputParsing.parseMultilineKeyEqualsValue(`equation=x^2+y^2=r^2
            `);
      expect(result).toEqual({
        equation: 'x^2+y^2=r^2',
      });
    });
  });
});
