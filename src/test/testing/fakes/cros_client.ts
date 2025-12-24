// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {getCrosPath} from '../../../common/chromiumos/cros_client';
import {FakeExec} from '../fake_exec';

export type FakePackages = {
  all: string[]; // all the package names (e.g. chromeos-base/codelab)
  allWorkon: string[]; // all the cros-workon package names
  workedOn: string[]; // all the worked on package names
};

export type FakeChrootState = {
  chromiumosRoot: string;
  host?: {
    packages: FakePackages;
  };
  boards: {
    name: string;
    packages: FakePackages;
  }[];
};

export function installFakeCrosClient(
  spiedExec: FakeExec,
  chroot: FakeChrootState
): void {
  const cros = getCrosPath(chroot.chromiumosRoot);

  if (chroot.host) {
    spiedExec.installStdout(
      cros,
      ['query', 'ebuilds', '-b', 'amd64-host', '-o', '{package_info.atom}'],
      chroot.host.packages.all.join('\n')
    );
    spiedExec.installStdout(
      cros,
      ['workon', '--host', 'list'],
      chroot.host.packages.workedOn.join('\n')
    );
    spiedExec.installStdout(
      cros,
      ['workon', '--host', 'list', '--all'],
      chroot.host.packages.allWorkon.join('\n')
    );
  }

  for (const {name, packages} of chroot.boards) {
    spiedExec.installStdout(
      cros,
      ['query', 'ebuilds', '-b', name, '-o', '{package_info.atom}'],
      packages.all.join('\n')
    );
    spiedExec.installStdout(
      cros,
      ['workon', '-b', name, 'list'],
      packages.workedOn.join('\n')
    );
    spiedExec.installStdout(
      cros,
      ['workon', '-b', name, 'list', '--all'],
      packages.allWorkon.join('\n')
    );
  }
}
