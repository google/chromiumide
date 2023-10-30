// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as path from 'path';
import * as vscode from 'vscode';
import * as commonUtil from '../../../../../../../common/common_util';
import {CommandContext} from '../../../../../../../features/device_management/commands/common';
import {DeviceCategory} from '../../../../../../../features/device_management/device_repository';
import {Metrics} from '../../../../../../../features/metrics/metrics';
import * as testing from '../../../../../../testing';
import {VscodeGetters, VscodeSpy} from '../../../../../../testing/doubles';
import {arrayWithPrefix} from '../../../../../testing/jasmine/asymmetric_matcher';
import {FakeDeviceRepository} from '../../fake_device_repository';
import {FakeSshServer} from '../../fake_ssh_server';

export type Config = {
  /** A temporary directory representing fake chromiumos root. */
  chromiumos: string;
  activeTextEditor: {
    /** Relative path from chromiumos. */
    path: string;
    /** The content of the file. */
    text: string;
  };
  /** Fake result of the `tast list` command. */
  tastListResult: string | Error;
  /** Name of the Tast test to pick from the listed tests. */
  testsToPick: string[];
};

/**
 * Prepares common fakes for the `preTestSetUp` function.
 *
 * @returns CommandContext can be used to call `preTestSetup`.
 */
export async function prepareCommonFakes(
  fakeExec: testing.FakeExec,
  vscodeGetters: VscodeGetters,
  vscodeSpy: VscodeSpy,
  config: Config,
  subscriptions: vscode.Disposable[]
): Promise<CommandContext> {
  const {chromiumos, activeTextEditor, tastListResult, testsToPick} = config;

  // Prepare a fake chroot.
  await testing.buildFakeChroot(chromiumos);

  // Prepare a fake device.
  const sshServer = new FakeSshServer();
  subscriptions.push(sshServer);
  await sshServer.listen();
  const port = sshServer.listenPort;
  const hostname = `localhost:${port}`;

  fakeExec
    .withArgs('ssh', jasmine.anything(), jasmine.anything())
    .and.callThrough();

  const deviceRepository = FakeDeviceRepository.create([
    {hostname: hostname, category: DeviceCategory.OWNED},
    {hostname: 'other', category: DeviceCategory.OWNED},
  ]);

  // Prepare a fake Tast test.
  vscodeGetters.window.activeTextEditor.and.returnValue({
    document: new testing.fakes.FakeTextDocument({
      uri: vscode.Uri.file(path.join(chromiumos, activeTextEditor.path)),
      text: activeTextEditor.text,
    }) as vscode.TextDocument,
  } as vscode.TextEditor);

  // Prepare user responses.
  spyOn(Metrics, 'send');
  vscodeSpy.window.showQuickPick
    .withArgs([hostname, 'other'], jasmine.anything())
    .and.resolveTo(hostname);
  vscodeSpy.window.showQuickPick
    .withArgs(jasmine.arrayContaining(testsToPick), jasmine.anything())
    .and.resolveTo(testsToPick);

  // Prepare external command responses.
  testing.fakes.installChrootCommandHandler(
    fakeExec,
    chromiumos as commonUtil.Source,
    'tast',
    arrayWithPrefix('list'),
    async () => tastListResult
  );

  return {
    deviceRepository,
    sshIdentity: sshServer.sshIdentity,
    sshSessions: new Map(),
    output: new testing.fakes.VoidOutputChannel() as vscode.OutputChannel,
  } as CommandContext;
}
