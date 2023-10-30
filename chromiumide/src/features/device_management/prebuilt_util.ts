// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as services from '../../services';

/**
 * Returns a list of prebuilt images available for the given board and image type.
 * Returned versions are sorted in the reverse-chronological order (newest first).
 */
export async function listPrebuiltVersions(
  board: string,
  imageType: string,
  chrootService: services.chromiumos.ChrootService,
  logger: vscode.OutputChannel
): Promise<string[]> {
  // gs://chromeos-image-archive/ contains prebuilt image files.
  // https://chromium.googlesource.com/chromiumos/docs/+/HEAD/gsutil.md
  const result = await chrootService.exec(
    'gsutil',
    ['ls', `gs://chromeos-image-archive/${board}-${imageType}/*/image.zip`],
    {
      logger: logger,
      sudoReason: 'to list available prebuilt images',
    }
  );
  if (result instanceof Error) {
    throw result;
  }

  const versionRegexp = /\/(R\d+-\d+\.\d+\.\d+(-\d+-\d+)?)\//gm;
  const versions = [];
  for (;;) {
    const match = versionRegexp.exec(result.stdout);
    if (!match) {
      break;
    }
    versions.push(match[1]);
  }

  versions.sort(compareCrosVersions);
  versions.reverse();
  return versions;
}

function compareCrosVersions(a: string, b: string): number {
  const va = parseCrosVersion(a);
  const vb = parseCrosVersion(b);
  for (let i = 0; i < va.length; i++) {
    if (va[i] !== vb[i]) {
      return va[i] < vb[i] ? -1 : 1;
    }
  }
  return 0;
}

function parseCrosVersion(s: string): number[] {
  const versionRegexp = /^R(\d+)-(\d+)\.(\d+)\.(\d+)(?:-(\d+)-(\d+))?$/;
  const match = versionRegexp.exec(s);
  if (!match) {
    throw new Error(`Invalid CrOS version string: ${s}`);
  }
  // Release image version without snapshot id and buildbucket id will have them as 0.
  return match.slice(1).map(t => Number(t) || 0);
}
