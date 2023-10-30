// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {BoardOrHost} from '../../../../../common/chromiumos/board_or_host';
import * as commonUtil from '../../../../../common/common_util';
import * as cros from '../../../../../common/cros';
import {CompdbServiceImpl} from '../../../../../features/chromiumos/cpp_code_completion/compdb_service';
import * as testing from '../../../../testing';
import * as fakes from '../../../../testing/fakes';

describe('Compdb service', () => {
  const tempdir = testing.tempDir();
  const {fakeExec} = testing.installFakeExec();
  fakes.installFakeSudo(fakeExec);

  const state = testing.cleanState(async () => {
    const chroot = await testing.buildFakeChroot(tempdir.path);
    const source = commonUtil.sourceDir(chroot);
    const out = commonUtil.crosOutDir(source);
    const output = vscode.window.createOutputChannel('fake');
    return {chroot, source, out, output};
  });

  it('generates compilation database', async () => {
    fakes.installChrootCommandHandler(
      fakeExec,
      state.source,
      'env',
      [
        'USE=compdb_only test',
        'ebuild-amd64-generic',
        '/mnt/host/source/src/third_party/chromiumos-overlay/chromeos-base/codelab/codelab-9999.ebuild',
        'clean',
        'compile',
      ],
      async () => {
        // Generate compilation database
        await testing.putFiles(state.chroot, {
          '/build/amd64-generic/tmp/portage/chromeos-base/codelab-9999/work/build/out/Default/compile_commands_no_chroot.json':
            '[]',
        });
        return '';
      }
    );
    fakes.installChrootCommandHandler(
      fakeExec,
      state.source,
      'env',
      [
        'ACCEPT_KEYWORDS=~*',
        'equery-amd64-generic',
        'which',
        '=chromeos-base/codelab-9999',
      ],
      () =>
        '/mnt/host/source/src/third_party/chromiumos-overlay/chromeos-base/codelab/codelab-9999.ebuild'
    );

    await fs.promises.mkdir(path.join(state.source, 'src/platform2/codelab'), {
      recursive: true,
    });
    await testing.putFiles(state.source, {
      'src/third_party/chromiumos-overlay/chromeos-base/codelab/codelab-9999.ebuild':
        '',
    });

    const compdbService = new CompdbServiceImpl(state.output, {
      chroot: new cros.WrapFs(state.chroot),
      source: new cros.WrapFs(state.source),
      out: new cros.WrapFs(state.out),
    });
    await compdbService.generate(BoardOrHost.newBoard('amd64-generic'), {
      sourceDir: 'src/platform2/codelab',
      pkg: {category: 'chromeos-base', name: 'codelab'},
    });

    expect(
      await fs.promises.readFile(
        path.join(state.source, 'src/platform2/codelab/compile_commands.json'),
        'utf8'
      )
    ).toBe('[]');
  });

  it('can update symlink to readonly file', async () => {
    fakes.installChrootCommandHandler(
      fakeExec,
      state.source,
      'env',
      [
        'USE=compdb_only test',
        'ebuild-amd64-generic',
        '/mnt/host/source/src/third_party/chromiumos-overlay/chromeos-base/codelab/codelab-9999.ebuild',
        'clean',
        'compile',
      ],
      async () => {
        // Generate compilation database
        await testing.putFiles(state.chroot, {
          '/build/amd64-generic/tmp/portage/chromeos-base/codelab-9999/work/build/out/Default/compile_commands_no_chroot.json':
            '[]',
        });
        return '';
      }
    );
    fakes.installChrootCommandHandler(
      fakeExec,
      state.source,
      'env',
      [
        'ACCEPT_KEYWORDS=~*',
        'equery-amd64-generic',
        'which',
        '=chromeos-base/codelab-9999',
      ],
      () =>
        '/mnt/host/source/src/third_party/chromiumos-overlay/chromeos-base/codelab/codelab-9999.ebuild'
    );

    await fs.promises.mkdir(path.join(state.source, 'src/platform2/codelab'), {
      recursive: true,
    });
    // Creates a symlink to an unremovable file.
    await fs.promises.symlink(
      '/dev/null',
      path.join(state.source, 'src/platform2/codelab/compile_commands.json')
    );
    await testing.putFiles(state.source, {
      'src/third_party/chromiumos-overlay/chromeos-base/codelab/codelab-9999.ebuild':
        '',
    });

    const compdbService = new CompdbServiceImpl(state.output, {
      chroot: new cros.WrapFs(state.chroot),
      source: new cros.WrapFs(state.source),
      out: new cros.WrapFs(state.out),
    });
    await compdbService.generate(BoardOrHost.newBoard('amd64-generic'), {
      sourceDir: 'src/platform2/codelab',
      pkg: {category: 'chromeos-base', name: 'codelab'},
    });

    expect(
      await fs.promises.readFile(
        path.join(state.source, 'src/platform2/codelab/compile_commands.json'),
        'utf8'
      )
    ).toBe('[]');
  });
});
