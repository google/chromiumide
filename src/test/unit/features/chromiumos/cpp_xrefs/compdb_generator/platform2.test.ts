// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import * as commonUtil from '../../../../../../../shared/app/common/common_util';
import * as config from '../../../../../../../shared/app/services/config';
import {GenericCompdbGenerator} from '../../../../../../common/cpp_xrefs/generic_compdb_generator';
import {ShouldGenerateResult} from '../../../../../../common/cpp_xrefs/types';
import {Platform2} from '../../../../../../features/chromiumos/cpp_xrefs/compdb_generator/platform2';
import * as compdbService from '../../../../../../features/chromiumos/cpp_xrefs/compdb_service';
import * as services from '../../../../../../services';
import {SpiedFakeCompdbService} from '../../../../../integration/features/cpp_xrefs/spied_fake_compdb_service';
import * as testing from '../../../../../testing';
import * as fakes from '../../../../../testing/fakes';

describe('platform2 compdb generator', () => {
  beforeEach(async () => {
    await config.board.update('amd64-generic');
  });

  const temp = testing.tempDir();
  const state = testing.cleanState(async () => {
    const osDir = temp.path;
    const {chroot} = await testing.buildFakeChromeos(osDir);
    const chromiumosRoot = commonUtil.crosRoot(chroot);

    await testing.putFiles(chromiumosRoot, {
      'src/platform2/.git/HEAD': '',
      'src/third_party/chromiumos-overlay/chromeos-base/cros-disks/cros-disks-9999.ebuild': `
PLATFORM_SUBDIR="cros-disks"
inherit cros-workon platform user
`,
    });

    const spiedFakeCompdbService = new SpiedFakeCompdbService(chromiumosRoot);
    const compdbGenerator = new GenericCompdbGenerator(
      new Platform2(
        services.chromiumos.ChrootService.maybeCreate(chromiumosRoot, false)!,
        new fakes.ConsoleOutputChannel(),
        spiedFakeCompdbService
      )
    );
    const cancellation = new vscode.CancellationTokenSource();
    return {
      chromiumosRoot,
      spiedFakeCompdbService,
      compdbGenerator,
      cancellation,
    };
  });

  afterEach(() => {
    state.cancellation.dispose();
  });

  it('runs for platform2 C++ file', async () => {
    const document = {
      fileName: path.join(
        state.chromiumosRoot,
        'src/platform2/cros-disks/disks.cc'
      ),
      languageId: 'cpp',
    } as vscode.TextDocument;

    expect(await state.compdbGenerator.shouldGenerate(document)).toEqual(
      ShouldGenerateResult.Yes
    );

    await expectAsync(
      state.compdbGenerator.generate(document, state.cancellation.token)
    ).toBeResolved();

    expect(state.spiedFakeCompdbService.requests).toEqual([
      {
        board: 'amd64-generic',
        packageInfo: {
          sourceDir: 'src/platform2/cros-disks',
          pkg: {category: 'chromeos-base', name: 'cros-disks'},
        },
      },
    ]);
  });

  it('runs for platform2 GN file', async () => {
    const document = {
      fileName: path.join(
        state.chromiumosRoot,
        'src/platform2/cros-disks/BUILD.gn'
      ),
      languageId: 'gn',
    } as vscode.TextDocument;

    expect(await state.compdbGenerator.shouldGenerate(document)).toEqual(
      ShouldGenerateResult.Yes
    );
  });

  it('does not run on C++ file if already generated', async () => {
    const document = {
      fileName: path.join(
        state.chromiumosRoot,
        'src/platform2/cros-disks/disks.cc'
      ),
      languageId: 'cpp',
    } as vscode.TextDocument;

    await state.compdbGenerator.generate(document, state.cancellation.token);

    expect(await state.compdbGenerator.shouldGenerate(document)).toEqual(
      ShouldGenerateResult.NoNeedNoChange
    );
  });

  it('does not rerun on C++ file if generation fails', async () => {
    const document = {
      fileName: path.join(
        state.chromiumosRoot,
        'src/platform2/cros-disks/disks.cc'
      ),
      languageId: 'cpp',
    } as vscode.TextDocument;

    spyOn(state.spiedFakeCompdbService, 'generate').and.rejectWith(
      new compdbService.CompdbError({
        kind: compdbService.CompdbErrorKind.RunEbuild,
      })
    );

    expect(await state.compdbGenerator.shouldGenerate(document)).toEqual(
      ShouldGenerateResult.Yes
    );

    await expectAsync(
      state.compdbGenerator.generate(document, state.cancellation.token)
    ).toBeRejected();

    expect(await state.compdbGenerator.shouldGenerate(document)).toEqual(
      ShouldGenerateResult.NoHasFailed
    );
  });

  it('runs for C++ file if compilation database has been removed', async () => {
    const document = {
      fileName: path.join(
        state.chromiumosRoot,
        'src/platform2/cros-disks/disks.cc'
      ),
      languageId: 'cpp',
    } as vscode.TextDocument;

    await state.compdbGenerator.generate(document, state.cancellation.token);

    await fs.promises.rm(
      path.join(
        state.chromiumosRoot,
        'src/platform2/cros-disks/compile_commands.json'
      )
    );

    expect(await state.compdbGenerator.shouldGenerate(document)).toEqual(
      ShouldGenerateResult.Yes
    );
  });

  // TODO(oka): Test error handling.
  // * When compdb generation fails, it should show an error message with the
  //   next action to take.
});
