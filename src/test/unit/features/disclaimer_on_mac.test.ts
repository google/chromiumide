// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as config from '../../../../shared/app/services/config';
import {DisclaimerOnMac} from '../../../features/disclaimer_on_mac';
import * as testing from '../../testing';

describe('disclaimer on mac', () => {
  const {vscodeSpy, vscodeEmitters} = testing.installVscodeDouble();
  testing.installFakeConfigs(vscodeSpy, vscodeEmitters);

  const subscriptions: vscode.Disposable[] = [];
  afterEach(() => {
    vscode.Disposable.from(...subscriptions.splice(0)).dispose();
  });

  it('is shown on Mac', async () => {
    await config.chromiumideDevelopment.osPlatform.update('darwin');
    vscodeSpy.window.showWarningMessage.and.returnValue('Ok');

    for (const n of [1, 2]) {
      const disclaimer = new DisclaimerOnMac();
      subscriptions.push(disclaimer);

      const reader = new testing.EventReader(
        disclaimer.onDidFinishCheck,
        subscriptions
      );

      await reader.read();

      // The message is shown twice if the class is instantiated twice.
      expect(vscodeSpy.window.showWarningMessage).toHaveBeenCalledTimes(n);
    }
  });

  it('is not shown on Linux', async () => {
    await config.chromiumideDevelopment.osPlatform.update('linux');

    const disclaimer = new DisclaimerOnMac();
    subscriptions.push(disclaimer);

    const reader = new testing.EventReader(
      disclaimer.onDidFinishCheck,
      subscriptions
    );

    await reader.read();

    expect(vscodeSpy.window.showWarningMessage).not.toHaveBeenCalled();
  });

  it('is not shown again if so instructed', async () => {
    await config.chromiumideDevelopment.osPlatform.update('darwin');

    vscodeSpy.window.showWarningMessage.and.returnValue("Don't show again");

    for (let i = 0; i < 2; i++) {
      const disclaimer = new DisclaimerOnMac();
      subscriptions.push(disclaimer);

      const reader = new testing.EventReader(
        disclaimer.onDidFinishCheck,
        subscriptions
      );

      await reader.read();

      // The message is not shown again if the user instructs so.
      expect(vscodeSpy.window.showWarningMessage).toHaveBeenCalledTimes(1);
    }
  });
});
