// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import 'jasmine';
import * as vscode from 'vscode';
import {extraEnvForDepotTools} from '../../../../shared/app/common/depot_tools';
import * as config from '../../../../shared/app/services/config';
import {TEST_ONLY} from '../../../driver/cros';
import * as testing from '../../testing';
import * as fakes from '../../testing/fakes';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const resetpromptedForMissingDepotTools =
  TEST_ONLY.resetpromptedForMissingDepotTools;

describe('depot_tools', () => {
  beforeEach(async () => {
    resetpromptedForMissingDepotTools();
  });

  const {vscodeEmitters, vscodeSpy} = testing.installVscodeDouble();
  testing.installFakeConfigs(vscodeSpy, vscodeEmitters);

  it('adjusts PATH based on settings', async () => {
    await config.paths.depotTools.update('/opt/custom_depot_tools');

    expect((await extraEnvForDepotTools()).PATH).toEqual(
      jasmine.stringMatching('^/opt/custom_depot_tools:.*:.*/depot_tools')
    );
  });
  it('adjusts PATH if settings empty', async () => {
    await config.paths.depotTools.update('');

    expect((await extraEnvForDepotTools()).PATH).toEqual(
      jasmine.stringMatching('^.*:.*/depot_tools')
    );
  });
});

describe('and depot_tools not found', () => {
  beforeEach(async () => {
    resetpromptedForMissingDepotTools();
  });

  const {vscodeEmitters, vscodeSpy} = testing.installVscodeDouble();
  testing.installFakeConfigs(vscodeSpy, vscodeEmitters);
  const fakeExec = testing.installFakeExec();
  fakes.installFakeDepotTools(fakeExec, false);
  const tempDir = testing.tempDir();

  it('opens a file dialog once', async () => {
    await testing.buildFakeDepotTools(tempDir.path);
    const userDir = await vscode.Uri.file(tempDir.path);
    vscodeSpy.window.showWarningMessage.and.resolveTo('Select directory');
    vscodeSpy.window.showOpenDialog.and.resolveTo([userDir]);

    // Ask for depot tools twice (here and in the expect).
    // This shouldn't result in any additional window openings.
    await extraEnvForDepotTools();

    expect((await extraEnvForDepotTools()).PATH).toEqual(
      jasmine.stringMatching(`^${tempDir.path}.*`)
    );

    expect(vscodeSpy.window.showWarningMessage).toHaveBeenCalledTimes(1);
    expect(vscodeSpy.window.showOpenDialog).toHaveBeenCalledTimes(1);
  });

  it('and cancel selected', async () => {
    await extraEnvForDepotTools();
    vscodeSpy.window.showWarningMessage.and.resolveTo(undefined);

    await extraEnvForDepotTools();

    expect(vscodeSpy.window.showWarningMessage).toHaveBeenCalledTimes(1);
    expect(vscodeSpy.window.showOpenDialog).toHaveBeenCalledTimes(0);
  });

  it('and user skips open dialog then selects correct path', async () => {
    await testing.buildFakeDepotTools(tempDir.path);
    const userDir = await vscode.Uri.file(tempDir.path);

    vscodeSpy.window.showWarningMessage.and.returnValues(
      'Select directory',
      'Select directory'
    );

    vscodeSpy.window.showOpenDialog.and.returnValues(
      Promise.resolve(undefined),
      Promise.resolve([userDir])
    );

    await extraEnvForDepotTools();

    // Both windows were shown twice and the path was updated.
    expect((await extraEnvForDepotTools()).PATH).toEqual(
      jasmine.stringMatching(`^${tempDir.path}.*`)
    );
    expect(vscodeSpy.window.showOpenDialog).toHaveBeenCalledTimes(2);
    expect(vscodeSpy.window.showWarningMessage).toHaveBeenCalledTimes(2);
  });
});
