// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as config from '../../../../../../shared/app/services/config';
import {TaskStatus} from '../../../../../../shared/app/ui/bg_task_status';
import {Breadcrumbs} from '../../../../../features/chromiumos/boards_and_packages/item';
import {Coverage} from '../../../../../features/chromiumos/coverage';
import * as services from '../../../../../services';
import * as testing from '../../../../testing';
import {FakeStatusManager, VoidOutputChannel} from '../../../../testing/fakes';

const coverageJsonContents =
  `{"data": [{ "files": [{
  "filename": "/build/amd64-generic/var/cache/portage/chromeos-base/chaps/out/Default/` +
  '../../../../../../../tmp/portage/chromeos-base/chaps-0.0.1-r3594/work/chaps-0.0.1/chaps/' +
  `slot_manager_impl.cc",
  "segments": [
    [142, 50, 515, true, true, false],
    [147, 2, 0, false, false, false],
    [156, 61, 313, true, true, false ]
    ]}]}]}
`;

const coverageJsonPath =
  '/build/amd64-generic/build/coverage_data/chromeos-base/chaps-0/0.0.1-r3594/coverage.json';

describe('Test coverage', () => {
  const tempDir = testing.tempDir();

  const {vscodeEmitters, vscodeSpy} = testing.installVscodeDouble();
  testing.installFakeConfigs(vscodeSpy, vscodeEmitters);

  const fakeExec = testing.installFakeExec();

  const subscriptions: vscode.Disposable[] = [];
  afterEach(() => {
    vscode.Disposable.from(...subscriptions.reverse()).dispose();
    subscriptions.splice(0);
  });

  const state = testing.cleanState(async () => {
    vscodeSpy.window.createOutputChannel.and.returnValue(
      new VoidOutputChannel()
    );

    const chromiumosRoot = tempDir.path;
    const {chroot} = await testing.buildFakeChromeos(chromiumosRoot);
    await testing.putFiles(chroot, {
      [coverageJsonPath]: coverageJsonContents,
    });
    const chrootService = services.chromiumos.ChrootService.maybeCreate(
      tempDir.path
    )!;
    const statusManager = new FakeStatusManager();
    return {
      chromiumosRoot,
      statusManager,
      coverage: new Coverage(chrootService, statusManager),
    };
  });

  it('ignores files not in platform2', async () => {
    expect(
      await state.coverage.readDocumentCoverage(
        '/mnt/host/source/infra/ide/chromiumide/package.cc'
      )
    ).toEqual({});
  });

  // TODO(ttylenda): coverage.json not found

  // TODO(ttylenda): coverage.json does not contain data for the file

  it('reads coverage data if it exists', async () => {
    await config.board.update('amd64-generic');

    const {covered: cov, uncovered: uncov} =
      await state.coverage.readDocumentCoverage(
        '/mnt/host/source/src/platform2/chaps/slot_manager_impl.cc'
      );
    expect(cov).toBeDefined();
    expect(uncov).toBeDefined();
  });

  it('activate method registers command', async () => {
    const {chromiumosRoot, statusManager, coverage} = state;

    coverage.activate({subscriptions} as vscode.ExtensionContext);

    let coverageGenerated = false;

    testing.fakes.installChrootCommandHandler(
      fakeExec,
      chromiumosRoot,
      'env',
      [
        'USE=coverage',
        'cros_run_unit_tests',
        '--board=betty',
        '--packages=chromeos-base/codelab',
      ],
      () => {
        coverageGenerated = true;
        return '';
      }
    );

    await vscode.commands.executeCommand(
      'chromiumide.coverage.generate',
      Breadcrumbs.from('betty', 'chromeos-base', 'codelab')
    );
    expect(coverageGenerated).toBeTrue();
    expect(statusManager.getStatus('Code Coverage')).toEqual(TaskStatus.OK);

    coverageGenerated = false;
    await vscode.commands.executeCommand(
      'chromiumide.coverage.generate',
      Breadcrumbs.from('betty', 'chromeos-base', 'codelab')
    );
    expect(coverageGenerated).toBeTrue();
    expect(statusManager.getStatus('Code Coverage')).toEqual(TaskStatus.OK);
  });
});
