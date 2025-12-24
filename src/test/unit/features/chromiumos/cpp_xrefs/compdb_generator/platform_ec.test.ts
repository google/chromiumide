// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import * as commonUtil from '../../../../../../../shared/app/common/common_util';
import * as config from '../../../../../../../shared/app/services/config';
import {ShouldGenerateResult} from '../../../../../../common/cpp_xrefs/types';
import * as compdbGenerator from '../../../../../../features/chromiumos/cpp_xrefs/compdb_generator';
import * as services from '../../../../../../services';
import * as testing from '../../../../../testing';
import * as fakes from '../../../../../testing/fakes';

describe('platform2 compdb generator', () => {
  beforeEach(async () => {
    await config.platformEc.board.update('bloonchipper');
    await config.platformEc.build.update('Makefile');
    await config.platformEc.mode.update('RW');
  });

  const fakeExec = testing.installFakeExec();
  const temp = testing.tempDir();
  const state = testing.cleanState(async () => {
    const {chroot} = await testing.buildFakeChromeos(temp.path);
    const chromiumosRoot = commonUtil.crosRoot(chroot);

    await testing.putFiles(chromiumosRoot, {
      'src/platform/ec/.git/HEAD': '',
    });

    // CompilationDatabase registers event handlers in the constructor.
    const generator = new compdbGenerator.PlatformEc(
      services.chromiumos.ChrootService.maybeCreate(temp.path, false)!,
      new fakes.ConsoleOutputChannel()
    );
    const cancellation = new vscode.CancellationTokenSource();
    return {
      chromiumosRoot,
      generator,
      cancellation,
    };
  });

  afterEach(() => {
    state.cancellation.dispose();
  });

  it('runs for platform/ec C++ file', async () => {
    const document = {
      fileName: path.join(state.chromiumosRoot, 'src/platform/ec/foo.cc'),
      languageId: 'cpp',
    } as vscode.TextDocument;

    expect(await state.generator.shouldGenerate(document)).toEqual(
      ShouldGenerateResult.Yes
    );
    fakes.installChrootCommandHandler(
      fakeExec,
      state.chromiumosRoot,
      'util/clangd_config.py',
      ['--os', 'ec', 'bloonchipper', 'rw'],
      async () => {
        await testing.putFiles(state.chromiumosRoot, {
          'src/platform/ec/compile_commands.json':
            'compile commands for bloonchipper:RW (Makefile)',
        });
        return '';
      },
      {
        crosSdkWorkingDir: '/mnt/host/source/src/platform/ec',
      }
    );
    await expectAsync(
      state.generator.generate(document, state.cancellation.token)
    ).toBeResolved();
    expect(
      await fs.promises.readFile(
        path.join(
          state.chromiumosRoot,
          'src/platform/ec/compile_commands.json'
        ),
        'utf8'
      )
    ).toEqual('compile commands for bloonchipper:RW (Makefile)');
    expect(await state.generator.shouldGenerate(document)).toEqual(
      ShouldGenerateResult.NoNeedNoChange
    );

    // Change mode from RW to RO and verify the file is re-generated
    await config.platformEc.mode.update('RO');
    expect(await state.generator.shouldGenerate(document)).toEqual(
      ShouldGenerateResult.Yes
    );
    fakes.installChrootCommandHandler(
      fakeExec,
      state.chromiumosRoot,
      'util/clangd_config.py',
      ['--os', 'ec', 'bloonchipper', 'ro'],
      async () => {
        await testing.putFiles(state.chromiumosRoot, {
          'src/platform/ec/compile_commands.json':
            'compile commands for bloonchipper:RO (Makefile)',
        });
        return '';
      },
      {
        crosSdkWorkingDir: '/mnt/host/source/src/platform/ec',
      }
    );
    await expectAsync(
      state.generator.generate(document, state.cancellation.token)
    ).toBeResolved();
    expect(
      await fs.promises.readFile(
        path.join(
          state.chromiumosRoot,
          'src/platform/ec/compile_commands.json'
        ),
        'utf8'
      )
    ).toEqual('compile commands for bloonchipper:RO (Makefile)');
    expect(await state.generator.shouldGenerate(document)).toEqual(
      ShouldGenerateResult.NoNeedNoChange
    );

    // Change board from bloonchipper to dartmonkey and verify the file is
    // re-generated
    await config.platformEc.board.update('dartmonkey');
    expect(await state.generator.shouldGenerate(document)).toEqual(
      ShouldGenerateResult.Yes
    );
    fakes.installChrootCommandHandler(
      fakeExec,
      state.chromiumosRoot,
      'util/clangd_config.py',
      ['--os', 'ec', 'dartmonkey', 'ro'],
      async () => {
        await testing.putFiles(state.chromiumosRoot, {
          'src/platform/ec/compile_commands.json':
            'compile commands for dartmonkey:RO (Makefile)',
        });
        return '';
      },
      {
        crosSdkWorkingDir: '/mnt/host/source/src/platform/ec',
      }
    );
    await expectAsync(
      state.generator.generate(document, state.cancellation.token)
    ).toBeResolved();
    expect(
      await fs.promises.readFile(
        path.join(
          state.chromiumosRoot,
          'src/platform/ec/compile_commands.json'
        ),
        'utf8'
      )
    ).toEqual('compile commands for dartmonkey:RO (Makefile)');
    expect(await state.generator.shouldGenerate(document)).toEqual(
      ShouldGenerateResult.NoNeedNoChange
    );

    // Change build from Makefile to Zephyr and verify the file is re-generated
    await config.platformEc.build.update('Zephyr');
    expect(await state.generator.shouldGenerate(document)).toEqual(
      ShouldGenerateResult.Yes
    );
    fakes.installChrootCommandHandler(
      fakeExec,
      state.chromiumosRoot,
      'util/clangd_config.py',
      ['--os', 'zephyr', 'dartmonkey', 'ro'],
      async () => {
        await testing.putFiles(state.chromiumosRoot, {
          'src/platform/ec/compile_commands.json':
            'compile commands for dartmonkey:RO (Zephyr)',
        });
        return '';
      },
      {
        crosSdkWorkingDir: '/mnt/host/source/src/platform/ec',
      }
    );
    await expectAsync(
      state.generator.generate(document, state.cancellation.token)
    ).toBeResolved();
    expect(
      await fs.promises.readFile(
        path.join(
          state.chromiumosRoot,
          'src/platform/ec/compile_commands.json'
        ),
        'utf8'
      )
    ).toEqual('compile commands for dartmonkey:RO (Zephyr)');
    expect(await state.generator.shouldGenerate(document)).toEqual(
      ShouldGenerateResult.NoNeedNoChange
    );
  });

  it('does not run outside platform/ec', async () => {
    const document = {
      fileName: path.join(state.chromiumosRoot, 'src/platform2/codelab/foo.cc'),
      languageId: 'cpp',
    } as vscode.TextDocument;

    expect(await state.generator.shouldGenerate(document)).toEqual(
      ShouldGenerateResult.NoUnsupported
    );
  });
});
