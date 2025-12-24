// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as path from 'path';
import * as vscode from 'vscode';
import {
  BoardOrHost,
  parseBoardOrHost,
} from '../../../../../../shared/app/common/chromiumos/board_or_host';
import {getDriver} from '../../../../../../shared/app/common/driver_repository';
import {AbnormalExitError} from '../../../../../../shared/app/common/exec/types';
import {SimplePickItem} from '../../../../../../shared/app/ui/input_box';
import {CommandContext} from '../../../../../features/device_management/commands/common';
import {TEST_ONLY} from '../../../../../features/device_management/commands/tast/tast_common';
import {
  DeviceAttributes,
  DeviceClient,
} from '../../../../../features/device_management/device_client';
import {DeviceCategory} from '../../../../../features/device_management/device_repository';
import {SshIdentity} from '../../../../../features/device_management/ssh_identity';
import {ChromiumosServiceModule} from '../../../../../services/chromiumos';
import * as testing from '../../../../testing';
import {VscodeGetters, VscodeSpy} from '../../../../testing/doubles';
import {arrayWithPrefix} from '../../../testing/jasmine/asymmetric_matcher';
import {FakeDeviceRepository} from '../fake_device_repository';
import {FakeSshServer} from '../fake_ssh_server';

const driver = getDriver();

export type Config = {
  /** A temporary directory representing fake chromiumos root. */
  chromiumos: string;
  tastTestConfig?: {
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
  boardConfig?: {
    boardName: string;
    prebuiltCrosMajorVersion?: number;
    packageConfigs: {
      packageName: string;
      crosDebugFlag: boolean | undefined;
    }[];
  };
  deviceConfig?: DeviceAttributes;
};

/**
 * Prepares common fakes for testing device management commands.
 *
 * @returns CommandContext can be used to call a command handler.
 */
export async function prepareCommonFakes(
  fakeExec: testing.FakeExec,
  vscodeGetters: VscodeGetters,
  vscodeSpy: VscodeSpy,
  config: Config,
  subscriptions: vscode.Disposable[]
): Promise<CommandContext> {
  const {chromiumos, tastTestConfig, boardConfig, deviceConfig} = config;

  // Prepare a fake chromeos.
  await testing.buildFakeChromeos(chromiumos);

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
  const deviceClient = new DeviceClient(
    deviceRepository,
    new SshIdentity(testing.getExtensionUri(), new ChromiumosServiceModule()),
    vscode.window.createOutputChannel('void'),
    vscode.window.createOutputChannel('void (background)'),
    new Map<string, DeviceAttributes>(
      deviceConfig ? [[hostname, deviceConfig]] : []
    )
  );

  const hostnameItem = new SimplePickItem(hostname);
  const otherHostnameItem = new SimplePickItem('other');
  vscodeSpy.window.showQuickPick
    .withArgs([hostnameItem, otherHostnameItem], jasmine.anything())
    .and.resolveTo(hostnameItem);

  if (tastTestConfig) {
    const {activeTextEditor, tastListResult, testsToPick} = tastTestConfig;
    // Prepare a fake Tast test.
    vscodeGetters.window.activeTextEditor.and.returnValue({
      document: new testing.fakes.FakeTextDocument({
        uri: vscode.Uri.file(path.join(chromiumos, activeTextEditor.path)),
        text: activeTextEditor.text,
      }) as vscode.TextDocument,
    } as vscode.TextEditor);

    // Prepare user responses.
    spyOn(driver.metrics, 'send');
    vscodeSpy.window.showQuickPick
      .withArgs(
        jasmine.arrayContaining(testsToPick),
        jasmine.objectContaining({title: TEST_ONLY.SELECT_TEST_TITLE})
      )
      .and.resolveTo(testsToPick);

    // Prepare external command responses.
    testing.fakes.installChrootCommandHandler(
      fakeExec,
      chromiumos,
      'tast',
      arrayWithPrefix('list'),
      async () => tastListResult
    );
  }

  if (boardConfig) {
    const {boardName, prebuiltCrosMajorVersion, packageConfigs} = boardConfig;
    if (prebuiltCrosMajorVersion) {
      const files: {[name: string]: string} = {};
      files[
        `src/private-overlays/chromeos-partner-overlay/chromeos/binhost/target/${boardName}-POSTSUBMIT_BINHOST.conf`
      ] = `POSTSUBMIT_BINHOST="gs://chromeos-prebuilt/board/${boardName}/postsubmit-R1-${prebuiltCrosMajorVersion}.0.0-93635-8758349179001996977/packages gs://chromeos-prebuilt/board/${boardName}/postsubmit-R1-${prebuiltCrosMajorVersion}.0.0-93676-8758270828991947137/packages"`;
      await testing.putFiles(chromiumos, files);
    }
    for (const packageConfig of packageConfigs) {
      const {packageName, crosDebugFlag} = packageConfig;
      installEmergeForUseFlagsCommandHandler(
        fakeExec,
        chromiumos,
        parseBoardOrHost(boardName),
        packageName,
        `
These are the packages that would be merged, in order:

[binary   R   *] ${packageName}-9999:0/9999::chromiumos to /build/${boardName}/ USE="${
          crosDebugFlag !== undefined
            ? `${crosDebugFlag ? '' : '-'}cros-debug`
            : ''
        }" 0 KiB

Total: 1 package (1 reinstall, 1 binary), Size of downloads: 0 KiB
`
      );
    }
  }

  return {
    deviceRepository,
    deviceClient,
    sshIdentity: sshServer.sshIdentity,
    sshSessions: new Map(),
    output: new testing.fakes.VoidOutputChannel() as vscode.OutputChannel,
  } as CommandContext;
}

export function installEmergeForUseFlagsCommandHandler(
  fakeExec: testing.FakeExec,
  chromiumosRoot: string,
  board: BoardOrHost,
  packageName: string,
  stdout: string,
  stderr?: string,
  exitSatus?: number
): void {
  const cmd = board.suffixedExecutable('emerge');
  const args = ['--pretend', '--verbose', '--nodeps', '--usepkg', packageName];
  testing.fakes.installChrootCommandHandler(
    fakeExec,
    chromiumosRoot,
    cmd,
    args,
    async () =>
      exitSatus
        ? new AbnormalExitError(cmd, args, exitSatus, stdout, stderr ?? '')
        : stdout
  );
}
