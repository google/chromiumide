// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as path from 'path';
import * as commonUtil from '../../../common/common_util';
import * as cros from '../../../common/cros';
import {
  CompdbError,
  CompdbErrorKind,
  CompdbServiceImpl,
} from '../../../features/cpp_code_completion/compdb_service';
import * as chroot from '../../../services/chroot';
import * as testing from '../../testing';

describe('Compdb service', () => {
  const tempdir = testing.tempDir();
  const {fakeExec} = testing.installFakeExec();
  const state = testing.cleanState(async () => {
    const chroot = await testing.buildFakeChroot(tempdir.path);
    const source = commonUtil.sourceDir(chroot);
    return {chroot, source};
  });

  it('generates compilation database', async () => {
    fakeExec
      .on(
        'sudo',
        testing.exactMatch(['-nv'], async () => '')
      )
      .on(
        'sudo',
        testing.exactMatch(
          [
            path.join(state.source, 'chromite/bin/cros_sdk'),
            '--',
            'env',
            'USE=compdb_only',
            'ebuild-amd64-generic',
            '/mnt/host/source/src/third_party/chromiumos-overlay/chromeos-base/codelab/codelab-9999.ebuild',
            'compile',
          ],
          async () => {
            // Generate compilation database
            await testing.putFiles(state.chroot, {
              '/build/amd64-generic/tmp/portage/chromeos-base/codelab-9999/work/build/out/Default/compile_commands_no_chroot.json':
                'fake compile commands',
            });
            return '';
          }
        )
      );
    await fs.promises.mkdir(path.join(state.source, 'src/platform2/codelab'), {
      recursive: true,
    });

    const compdbService = new CompdbServiceImpl(_x => {},
    new chroot.ChrootService(new cros.WrapFs(state.chroot), new cros.WrapFs(state.source)));
    await compdbService.generate('amd64-generic', {
      sourceDir: 'src/platform2/codelab',
      atom: 'chromeos-base/codelab',
    });

    expect(
      await fs.promises.readFile(
        path.join(state.source, 'src/platform2/codelab/compile_commands.json'),
        'utf8'
      )
    ).toBe('fake compile commands');
  });

  it('can update symlink to readonly file', async () => {
    fakeExec
      .on(
        'sudo',
        testing.exactMatch(['-nv'], async () => '')
      )
      .on(
        'sudo',
        testing.exactMatch(
          [
            path.join(state.source, 'chromite/bin/cros_sdk'),
            '--',
            'env',
            'USE=compdb_only',
            'ebuild-amd64-generic',
            '/mnt/host/source/src/third_party/chromiumos-overlay/chromeos-base/codelab/codelab-9999.ebuild',
            'compile',
          ],
          async () => {
            // Generate compilation database
            await testing.putFiles(state.chroot, {
              '/build/amd64-generic/tmp/portage/chromeos-base/codelab-9999/work/build/out/Default/compile_commands_no_chroot.json':
                'fake compile commands',
            });
            return '';
          }
        )
      );

    await fs.promises.mkdir(path.join(state.source, 'src/platform2/codelab'), {
      recursive: true,
    });
    // Creates a symlink to an unremovable file.
    await fs.promises.symlink(
      '/dev/null',
      path.join(state.source, 'src/platform2/codelab/compile_commands.json')
    );

    const compdbService = new CompdbServiceImpl(_x => {},
    new chroot.ChrootService(new cros.WrapFs(state.chroot), new cros.WrapFs(state.source)));
    await compdbService.generate('amd64-generic', {
      sourceDir: 'src/platform2/codelab',
      atom: 'chromeos-base/codelab',
    });

    expect(
      await fs.promises.readFile(
        path.join(state.source, 'src/platform2/codelab/compile_commands.json'),
        'utf8'
      )
    ).toBe('fake compile commands');
  });

  it('throws error on invalid password', async () => {
    fakeExec
      .on(
        'sudo',
        testing.exactMatch(['-nv'], async () => '')
      )
      .on(
        'sudo',
        testing.exactMatch(
          [
            path.join(state.source, 'chromite/bin/cros_sdk'),
            '--',
            'env',
            'USE=compdb_only',
            'ebuild-amd64-generic',
            '/mnt/host/source/src/third_party/chromiumos-overlay/chromeos-base/codelab/codelab-9999.ebuild',
            'compile',
          ],
          async () => {
            return new chroot.InvalidPasswordError('invalid');
          }
        )
      );
    await fs.promises.mkdir(path.join(state.source, 'src/platform2/codelab'), {
      recursive: true,
    });

    const compdbService = new CompdbServiceImpl(_x => {},
    new chroot.ChrootService(new cros.WrapFs(state.chroot), new cros.WrapFs(state.source)));

    await expectAsync(
      compdbService.generate('amd64-generic', {
        sourceDir: 'src/platform2/codelab',
        atom: 'chromeos-base/codelab',
      })
    ).toBeRejectedWith(
      new CompdbError({
        kind: CompdbErrorKind.InvalidPassword,
        message: 'invalid',
      })
    );
  });
});
