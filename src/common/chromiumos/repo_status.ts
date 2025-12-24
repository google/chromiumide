// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as path from 'path';
import {Board} from '../../../shared/app/common/chromiumos/board_or_host';
import {chromiumos} from '../../services';
import {
  CROS_IMAGE_VERSION_RE_SRC,
  ImageVersion,
  parseFullCrosVersion,
} from '../image_version';

const PRIVATE_BINHOST_DIR =
  'src/private-overlays/chromeos-partner-overlay/chromeos/binhost/target/';

const PUBLIC_BINHOST_DIR =
  'src/third_party/chromiumos-overlay/chromeos/binhost/target/';

async function getCrosPrebuiltVersionsFromFile(
  filepath: string,
  target: string
): Promise<ImageVersion[] | Error> {
  const content = await fs.promises.readFile(filepath, {encoding: 'utf-8'});
  const matches = [
    ...content.matchAll(
      new RegExp(
        `gs://chromeos-prebuilt/board/${target}/postsubmit-(${CROS_IMAGE_VERSION_RE_SRC})/packages`,
        'g'
      )
    ),
  ];
  if (matches.length === 0) {
    return new Error(
      `Binhost file for ${target} does not contain valid prebuilt path: ${filepath}`
    );
  }
  // Multiple prebuilts are listed and their CrOS major versions may be different. Use the most
  // recent one.
  return matches.map(m => parseFullCrosVersion(m[1]));
}

/*
 * Return the list of image versions from the bin host files for given board as a reference to which
 * version the repo is closest to.
 * It must be a device board but not host.
 *
 * Portage uses prebuilts from postsubmit builders to speed up the build process. They are updated
 * during repo sync and reflect the postsubmit versions closest to the state of the local repo.
 */
export async function getCrosPrebuiltVersionsFromBinHost(
  board: Board,
  chrootService: chromiumos.ChrootService
): Promise<ImageVersion[] | Error> {
  const target = board.toBoardName();

  const [binHostFilePrivate, binHostFilePublic] = [
    PRIVATE_BINHOST_DIR,
    PUBLIC_BINHOST_DIR,
  ].map(dir =>
    path.join(
      chrootService.chromiumos.root,
      dir,
      `${target}-POSTSUBMIT_BINHOST.conf`
    )
  );

  // Most boards are internal, e.g. betty, brya, hatch.
  if (fs.existsSync(binHostFilePrivate)) {
    return getCrosPrebuiltVersionsFromFile(binHostFilePrivate, target);
  }
  // Public board, e.g. amd64-generic.
  if (fs.existsSync(binHostFilePublic)) {
    return getCrosPrebuiltVersionsFromFile(binHostFilePublic, target);
  }
  return new Error(
    `${target} has no binhost file: neither ${binHostFilePrivate} nor ${binHostFilePublic} exists.`
  );
}
