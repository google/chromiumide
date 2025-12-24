// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {getDriver} from '../../../shared/app/common/driver_repository';
import {AbnormalExitError} from '../../../shared/app/common/exec/types';
import {
  compareCrosVersions,
  parseFullCrosVersion,
} from '../../common/image_version';
import * as services from '../../services';

const driver = getDriver();

export const PREBUILT_IMAGE_TYPES = [
  'release',
  'cq',
  'postsubmit',
  'snapshot',
] as const;
export type PrebuiltImageType = typeof PREBUILT_IMAGE_TYPES[number];

/**
 * Returns a list of prebuilt images available for the given board and image type, matching the
 * version pattern (all versions by default).
 * Returned versions are sorted in the reverse-chronological order (newest first).
 */
export async function listPrebuiltVersions(
  board: string,
  imageType: PrebuiltImageType,
  chrootService: services.chromiumos.ChrootService,
  logger: vscode.OutputChannel,
  versionPattern = '*',
  cancellationToken?: vscode.CancellationToken
): Promise<string[] | Error> {
  // gs://chromeos-image-archive/ contains prebuilt image files.
  // https://chromium.googlesource.com/chromiumos/docs/+/HEAD/gsutil.md
  const result = await chrootService.exec(
    'gsutil',
    [
      'ls',
      `gs://chromeos-image-archive/${board}-${imageType}/${versionPattern}/image.zip`,
    ],
    {
      logger: logger,
      sudoReason: 'to list available prebuilt images',
      cancellationToken,
    }
  );
  if (result instanceof Error) {
    // A special case for the command ending abnormally. Return [] if there is not matching file.
    if (
      result instanceof AbnormalExitError &&
      result.stderr.includes('One or more URLs matched no objects')
    ) {
      return [];
    }
    driver.metrics.send({
      category: 'error',
      group: 'prebuilt_utils',
      name: 'prebuilt_utils_fetch_gs_images_error',
      description: result.message,
      board: board,
      image_type: imageType,
      pattern: versionPattern,
    });
    return result;
  }

  const versionRegexp = /\/(R\d+-\d+\.\d+\.\d+(-\d+-\d+)?)\//gm;
  const versions = [];
  for (;;) {
    const match = versionRegexp.exec(result.stdout);
    if (!match) {
      break;
    }
    versions.push({
      imageString: match[1],
      parsedImage: parseFullCrosVersion(match[1]),
    });
  }

  versions.sort((va, vb) =>
    compareCrosVersions(va.parsedImage, vb.parsedImage)
  );
  versions.reverse();
  return versions.map(v => v.imageString);
}
