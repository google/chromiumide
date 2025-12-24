// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {
  Board,
  BoardOrHost,
  HOST,
} from '../../../../../../shared/app/common/chromiumos/board_or_host';
import {AbnormalExitError} from '../../../../../../shared/app/common/exec/types';
import {getUseFlagsInstalled} from '../../../../../common/chromiumos/portage/equery';
import * as services from '../../../../../services';
import * as testing from '../../../../testing';
import * as fakes from '../../../../testing/fakes';

function installEmergeForUseFlagsCommandHandler(
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
  fakes.installChrootCommandHandler(
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

describe('equery use flag', () => {
  const fakeExec = testing.installFakeExec();
  fakes.installFakeSudo(fakeExec);
  const tempDir = testing.tempDir();

  it('on board trogdor', async () => {
    await testing.buildFakeChromeos(tempDir.path);

    const board = Board.newBoard('trogdor');
    const packageName = 'chromeos-base/libchrome';
    const fakeStdout = `
These are the packages that would be merged, in order:

[binary   R   *] chromeos-base/libchrome-9999:0/9999::chromiumos to /build/trogdor/ USE="cros-debug msan* -dbus -asan -cfi -cfi_diag*" 0 KiB

Total: 1 package (1 reinstall, 1 binary), Size of downloads: 0 KiB
`;

    installEmergeForUseFlagsCommandHandler(
      fakeExec,
      tempDir.path,
      board,
      packageName,
      fakeStdout
    );

    const flags = await getUseFlagsInstalled(
      board,
      packageName,
      services.chromiumos.ChrootService.maybeCreate(tempDir.path, false)!
    );
    expect(flags).toBeInstanceOf(Map<string, boolean>);
    expect(flags).toEqual(
      new Map<string, boolean>([
        ['cros-debug', true],
        ['msan', false],
        ['dbus', false],
        ['asan', false],
        ['cfi', false],
        ['cfi_diag', true],
      ])
    );
  });

  it('on host', async () => {
    await testing.buildFakeChromeos(tempDir.path);

    const board = HOST;
    const packageName = 'chromeos-base/libbrillo';
    const fakeStdout = `
These are the packages that would be merged, in order:

[binary   R    ] chromeos-base/libbrillo-0.0.1-r2397:0/0.0.1-r2397::chromiumos  USE="cros_host dbus udev* -asan -compilation_database*" 0 KiB

Total: 1 package (1 reinstall, 1 binary), Size of downloads: 0 KiB
`;
    installEmergeForUseFlagsCommandHandler(
      fakeExec,
      tempDir.path,
      board,
      packageName,
      fakeStdout
    );

    const flags = await getUseFlagsInstalled(
      board,
      packageName,
      services.chromiumos.ChrootService.maybeCreate(tempDir.path, false)!
    );
    expect(flags).toBeInstanceOf(Map<string, boolean>);
    expect(flags).toEqual(
      new Map<string, boolean>([
        ['cros_host', true],
        ['dbus', true],
        ['udev', false],
        ['asan', false],
        ['compilation_database', true],
      ])
    );
  });

  it('fails with command not found error', async () => {
    await testing.buildFakeChromeos(tempDir.path);

    const board = Board.newBoard('hatch');
    const packageName = 'chromeos-base/libchrome';
    installEmergeForUseFlagsCommandHandler(
      fakeExec,
      tempDir.path,
      board,
      packageName,
      '',
      'env: ‘emerge-hatch’: No such file or directory',
      127
    );

    expect(
      (
        (await getUseFlagsInstalled(
          board,
          packageName,
          services.chromiumos.ChrootService.maybeCreate(tempDir.path, false)!
        )) as Error
      ).message
    ).toContain('command not found: have you setup board hatch on chroot?');
  });

  it('fails with no binary package error with no suggestion', async () => {
    await testing.buildFakeChromeos(tempDir.path);

    const board = Board.newBoard('trogdor');
    const packageName = 'abcdef';
    const fakeStdErr = `
emerge: there are no binary packages to satisfy "abcdef" for /build/trogdor/.

emerge: searching for similar names... nothing similar found.
`;
    installEmergeForUseFlagsCommandHandler(
      fakeExec,
      tempDir.path,
      board,
      packageName,
      '',
      fakeStdErr,
      1
    );

    expect(
      (
        (await getUseFlagsInstalled(
          board,
          packageName,
          services.chromiumos.ChrootService.maybeCreate(tempDir.path, false)!
        )) as Error
      ).message
    ).toContain('binary package not found: emerge: nothing similar found.');
  });

  it('fails with no binary package error with single suggestion', async () => {
    // Do not install fake chroot command handler i.e. should give command not found error.
    await testing.buildFakeChromeos(tempDir.path);

    const board = Board.newBoard('trogdor');
    const packageName = 'foo';
    const fakeStdErr = `
emerge: there are no binary packages to satisfy "foo" for /build/trogdor/.

emerge: searching for similar names...
emerge: Maybe you meant sys-block/fio?
`;

    installEmergeForUseFlagsCommandHandler(
      fakeExec,
      tempDir.path,
      board,
      packageName,
      '',
      fakeStdErr,
      1
    );

    expect(
      (
        (await getUseFlagsInstalled(
          Board.newBoard('trogdor'),
          'foo',
          services.chromiumos.ChrootService.maybeCreate(tempDir.path, false)!
        )) as Error
      ).message
    ).toContain(
      'binary package not found: emerge: Maybe you meant sys-block/fio?'
    );
  });

  it('fails with no binary package error with multiple suggestions', async () => {
    // Do not install fake chroot command handler i.e. should give command not found error.
    await testing.buildFakeChromeos(tempDir.path);

    const board = Board.newBoard('trogdor');
    const packageName = 'libchro';
    const fakeStdErr = `
emerge: there are no binary packages to satisfy "libchro" for /build/trogdor/.

emerge: searching for similar names...
emerge: Maybe you meant any of these: chromeos-base/libchrome, dev-libs/libcroco, dev-rust/libchromeos?
`;
    installEmergeForUseFlagsCommandHandler(
      fakeExec,
      tempDir.path,
      board,
      packageName,
      '',
      fakeStdErr,
      1
    );

    expect(
      (
        (await getUseFlagsInstalled(
          board,
          packageName,
          services.chromiumos.ChrootService.maybeCreate(tempDir.path, false)!
        )) as Error
      ).message
    ).toContain(
      'binary package not found: emerge: Maybe you meant any of these: chromeos-base/libchrome, dev-libs/libcroco, dev-rust/libchromeos?'
    );
  });
});
