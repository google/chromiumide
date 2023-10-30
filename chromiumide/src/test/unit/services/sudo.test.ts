// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as childProcess from 'child_process';
import * as util from 'util';
import * as commonUtil from '../../../common/common_util';
import * as sudo from '../../../services/sudo';
import * as testing from '../../testing';
import * as doubles from '../../testing/doubles';
import {arrayWithPrefix} from '../testing/jasmine/asymmetric_matcher';

// Password accepted by the simulated sudo command.
const SUDO_PASSWORD = 'my_secret_password';

describe('Sudo service', () => {
  const {fakeExec} = testing.installFakeExec();

  beforeEach(() => {
    // Install a FakeExec handler that simulates sudo.
    fakeExec
      .withArgs('sudo', arrayWithPrefix('--askpass', '--'), jasmine.anything())
      .and.callFake(
        async (_sudo, [_askpass, _hyphens, ...restArgs], options) => {
          const askpass = options!.env?.SUDO_ASKPASS;
          if (!askpass) {
            return new Error('SUDO_ASKPASS not set');
          }

          for (let attempt = 0; attempt < 3; attempt++) {
            // Use childProcess.execFile instead of commonUtil.exec to actually
            // run the script without going into fakes.
            const {stdout} = await util.promisify(childProcess.execFile)(
              askpass
            );
            if (stdout === SUDO_PASSWORD) {
              // Pass through to the next handler.
              return commonUtil.exec(restArgs[0], restArgs.slice(1), options);
            }
          }
          return new Error('Wrong password');
        }
      );

    // Install a fake hello command.
    fakeExec.installStdout('hello', ['world'], 'Hello, world!');
  });

  const {vscodeSpy} = doubles.installVscodeDouble();

  it('runs a command with 1 password attempt', async () => {
    vscodeSpy.window.showInputBox.and.returnValues(
      Promise.resolve(SUDO_PASSWORD)
    );

    const result = await sudo.execSudo('hello', ['world'], {
      sudoReason: 'to greet',
    });
    expect(result).toEqual({
      exitStatus: 0,
      stdout: 'Hello, world!',
      stderr: '',
    });
  });

  it('runs a command with 3 password attempts', async () => {
    vscodeSpy.window.showInputBox.and.returnValues(
      Promise.resolve('wrong_password_1'),
      Promise.resolve('wrong_password_2'),
      Promise.resolve(SUDO_PASSWORD)
    );

    const result = await sudo.execSudo('hello', ['world'], {
      sudoReason: 'to greet',
    });
    expect(result).toEqual({
      exitStatus: 0,
      stdout: 'Hello, world!',
      stderr: '',
    });
  });

  it('fails to run a command with many password attempts', async () => {
    vscodeSpy.window.showInputBox.and.returnValues(
      Promise.resolve('wrong_password_1'),
      Promise.resolve('wrong_password_2'),
      Promise.resolve('wrong_password_3'),
      Promise.resolve(SUDO_PASSWORD)
    );

    const result = await sudo.execSudo('hello', ['world'], {
      sudoReason: 'to greet',
    });
    expect(result).toBeInstanceOf(Error);
  });
});
