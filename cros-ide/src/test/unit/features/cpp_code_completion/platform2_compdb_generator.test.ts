// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import * as commonUtil from '../../../../common/common_util';
import * as cros from '../../../../common/cros';
import {Platform2CompdbGenerator} from '../../../../features/cpp_code_completion/platform2_compdb_generator';
import * as servicesChroot from '../../../../services/chroot';
import * as config from '../../../../services/config';
import {SpiedFakeCompdbService} from '../../../integration/features/cpp_code_completion/spied_fake_compdb_service';
import * as testing from '../../../testing';
import * as fakes from '../../../testing/fakes';

describe('platform2 compdb generator', () => {
  beforeEach(async () => {
    await config.board.update('amd64-generic');
  });

  const temp = testing.tempDir();
  const state = testing.cleanState(async () => {
    const osDir = temp.path;
    const chroot = await testing.buildFakeChroot(osDir);
    const source = commonUtil.sourceDir(chroot);

    await testing.putFiles(source, {
      'src/platform2/.git/HEAD': '',
      'src/third_party/chromiumos-overlay/chromeos-base/cros-disks/cros-disks-9999.ebuild': `
PLATFORM_SUBDIR="cros-disks"
inherit cros-workon platform user
`,
    });

    const spiedFakeCompdbService = new SpiedFakeCompdbService(source);
    // CompilationDatabase registers event handlers in the constructor.
    const compdbGenerator = new Platform2CompdbGenerator(
      new servicesChroot.ChrootService(
        new cros.WrapFs(chroot),
        new cros.WrapFs(source)
      ),
      new fakes.ConsoleOutputChannel(),
      spiedFakeCompdbService
    );
    const cancellation = new vscode.CancellationTokenSource();
    return {
      source,
      spiedFakeCompdbService,
      compdbGenerator,
      cancellation,
    };
  });

  afterEach(() => {
    vscode.Disposable.from(state.compdbGenerator, state.cancellation).dispose();
  });

  it('runs for platform2 C++ file', async () => {
    const document = {
      fileName: path.join(state.source, 'src/platform2/cros-disks/disks.cc'),
      languageId: 'cpp',
    } as vscode.TextDocument;

    expect(await state.compdbGenerator.shouldGenerate(document)).toBeTrue();

    await expectAsync(
      state.compdbGenerator.generate(document, state.cancellation.token)
    ).toBeResolved();

    expect(state.spiedFakeCompdbService.requests).toEqual([
      {
        board: 'amd64-generic',
        packageInfo: {
          sourceDir: 'src/platform2/cros-disks',
          atom: 'chromeos-base/cros-disks',
        },
      },
    ]);
  });

  it('runs for platform2 GN file', async () => {
    const document = {
      fileName: path.join(state.source, 'src/platform2/cros-disks/BUILD.gn'),
      languageId: 'gn',
    } as vscode.TextDocument;

    expect(await state.compdbGenerator.shouldGenerate(document)).toBeTrue();
  });

  it('does not run on C++ file if already generated', async () => {
    const document = {
      fileName: path.join(state.source, 'src/platform2/cros-disks/disks.cc'),
      languageId: 'cpp',
    } as vscode.TextDocument;

    await state.compdbGenerator.generate(document, state.cancellation.token);

    expect(await state.compdbGenerator.shouldGenerate(document)).toBeFalse();
  });

  it('runs for C++ file if compilation database has been removed', async () => {
    const document = {
      fileName: path.join(state.source, 'src/platform2/cros-disks/disks.cc'),
      languageId: 'cpp',
    } as vscode.TextDocument;

    await state.compdbGenerator.generate(document, state.cancellation.token);

    await fs.promises.rm(
      path.join(state.source, 'src/platform2/cros-disks/compile_commands.json')
    );

    expect(await state.compdbGenerator.shouldGenerate(document)).toBeTrue();
  });

  // TODO(oka): Test error handling.
  // * When compdb generation fails, it should show an error message with the
  //   next action to take.
});
