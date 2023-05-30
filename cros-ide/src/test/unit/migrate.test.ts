// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as migrate from '../../migrate';
import * as config from '../../services/config';
import {installFakeConfigs, installVscodeDouble} from '../testing';

describe('migrate', () => {
  const {vscodeSpy, vscodeEmitters} = installVscodeDouble();
  installFakeConfigs(vscodeSpy, vscodeEmitters);

  it('migrates board config with old prefix', async () => {
    await config.board.updateOldConfig('foo');

    expect(config.board.inspectOldConfig()?.globalValue).toEqual('foo');

    await migrate.migrate();

    expect(config.board.inspectOldConfig()?.globalValue).toEqual(undefined);
    expect(config.board.get()).toEqual('foo');

    await migrate.migrate(); // does nothing

    expect(config.board.inspectOldConfig()?.globalValue).toEqual(undefined);
    expect(config.board.get()).toEqual('foo');
  });

  it('honors configuration target', async () => {
    await config.board.updateOldConfig('g', vscode.ConfigurationTarget.Global);
    await config.board.updateOldConfig(
      'w',
      vscode.ConfigurationTarget.Workspace
    );
    await config.board.updateOldConfig(
      'f',
      vscode.ConfigurationTarget.WorkspaceFolder
    );

    await migrate.migrate();

    expect(config.board.get()).toEqual('f');

    await config.board.update(
      undefined,
      vscode.ConfigurationTarget.WorkspaceFolder
    );

    expect(config.board.get()).toEqual('w');

    await config.board.update(undefined, vscode.ConfigurationTarget.Workspace);

    expect(config.board.get()).toEqual('g');
  });
});
