// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import * as commonUtil from '../../../../../../common/common_util';
import * as compdbGenerator from '../../../../../../features/chromiumos/cpp_code_completion/compdb_generator';
import * as services from '../../../../../../services';
import * as config from '../../../../../../services/config';
import * as testing from '../../../../../testing';
import * as fakes from '../../../../../testing/fakes';

describe('platform2 compdb generator', () => {
  beforeEach(async () => {
    await config.platformEc.board.update('bloonchipper');
    await config.platformEc.build.update('Makefile');
    await config.platformEc.mode.update('RW');
  });

  const {fakeExec} = testing.installFakeExec();
  const temp = testing.tempDir();
  const state = testing.cleanState(async () => {
    const chroot = await testing.buildFakeChroot(temp.path);
    const source = commonUtil.sourceDir(chroot);

    await testing.putFiles(source, {
      'src/platform/ec/.git/HEAD': '',
    });

    // CompilationDatabase registers event handlers in the constructor.
    const generator = new compdbGenerator.PlatformEc(
      services.chromiumos.ChrootService.maybeCreate(temp.path, false)!,
      new fakes.ConsoleOutputChannel()
    );
    const cancellation = new vscode.CancellationTokenSource();
    return {
      source,
      generator,
      cancellation,
    };
  });

  afterEach(() => {
    vscode.Disposable.from(state.generator, state.cancellation).dispose();
  });

  it('runs for platform/ec C++ file', async () => {
    const document = {
      fileName: path.join(state.source, 'src/platform/ec/foo.cc'),
      languageId: 'cpp',
    } as vscode.TextDocument;

    expect(await state.generator.shouldGenerate(document)).toEqual(
      compdbGenerator.ShouldGenerateResult.Yes
    );
    fakes.installChrootCommandHandler(
      fakeExec,
      state.source,
      'util/clangd_config.py',
      ['--os', 'ec', 'bloonchipper', 'rw'],
      async () => {
        await testing.putFiles(state.source, {
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
        path.join(state.source, 'src/platform/ec/compile_commands.json'),
        'utf8'
      )
    ).toEqual('compile commands for bloonchipper:RW (Makefile)');
    expect(await state.generator.shouldGenerate(document)).toEqual(
      compdbGenerator.ShouldGenerateResult.NoNeedNoChange
    );

    // Change mode from RW to RO and verify the file is re-generated
    await config.platformEc.mode.update('RO');
    expect(await state.generator.shouldGenerate(document)).toEqual(
      compdbGenerator.ShouldGenerateResult.Yes
    );
    fakes.installChrootCommandHandler(
      fakeExec,
      state.source,
      'util/clangd_config.py',
      ['--os', 'ec', 'bloonchipper', 'ro'],
      async () => {
        await testing.putFiles(state.source, {
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
        path.join(state.source, 'src/platform/ec/compile_commands.json'),
        'utf8'
      )
    ).toEqual('compile commands for bloonchipper:RO (Makefile)');
    expect(await state.generator.shouldGenerate(document)).toEqual(
      compdbGenerator.ShouldGenerateResult.NoNeedNoChange
    );

    // Change board from bloonchipper to dartmonkey and verify the file is
    // re-generated
    await config.platformEc.board.update('dartmonkey');
    expect(await state.generator.shouldGenerate(document)).toEqual(
      compdbGenerator.ShouldGenerateResult.Yes
    );
    fakes.installChrootCommandHandler(
      fakeExec,
      state.source,
      'util/clangd_config.py',
      ['--os', 'ec', 'dartmonkey', 'ro'],
      async () => {
        await testing.putFiles(state.source, {
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
        path.join(state.source, 'src/platform/ec/compile_commands.json'),
        'utf8'
      )
    ).toEqual('compile commands for dartmonkey:RO (Makefile)');
    expect(await state.generator.shouldGenerate(document)).toEqual(
      compdbGenerator.ShouldGenerateResult.NoNeedNoChange
    );

    // Change build from Makefile to Zephyr and verify the file is re-generated
    await config.platformEc.build.update('Zephyr');
    expect(await state.generator.shouldGenerate(document)).toEqual(
      compdbGenerator.ShouldGenerateResult.Yes
    );
    fakes.installChrootCommandHandler(
      fakeExec,
      state.source,
      'util/clangd_config.py',
      ['--os', 'zephyr', 'dartmonkey', 'ro'],
      async () => {
        await testing.putFiles(state.source, {
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
        path.join(state.source, 'src/platform/ec/compile_commands.json'),
        'utf8'
      )
    ).toEqual('compile commands for dartmonkey:RO (Zephyr)');
    expect(await state.generator.shouldGenerate(document)).toEqual(
      compdbGenerator.ShouldGenerateResult.NoNeedNoChange
    );
  });

  it('does not run outside platform/ec', async () => {
    const document = {
      fileName: path.join(state.source, 'src/platform2/codelab/foo.cc'),
      languageId: 'cpp',
    } as vscode.TextDocument;

    expect(await state.generator.shouldGenerate(document)).toEqual(
      compdbGenerator.ShouldGenerateResult.NoUnsupported
    );
  });
});
