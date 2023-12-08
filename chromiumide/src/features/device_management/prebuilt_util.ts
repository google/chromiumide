// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as https from 'https';
import * as vscode from 'vscode';
import * as services from '../../services';

export type ImageVersion = {
  chromeMilestone: number;
  chromeOsMajor?: number;
  chromeOsMinor?: number;
  chromeOsPatch?: number;
  snapshotId?: string;
  buildId?: string;
};

function compareCrosVersions(a: ImageVersion, b: ImageVersion): number {
  if (a.chromeMilestone !== b.chromeMilestone) {
    return a.chromeMilestone < b.chromeMilestone ? -1 : 1;
  }
  if (a.chromeOsMajor !== b.chromeOsMajor) {
    if (!b.chromeOsMajor) return 1;
    if (!a.chromeOsMajor) return -1;
    return a.chromeOsMajor < b.chromeOsMajor ? -1 : 1;
  }
  if (a.chromeOsMinor !== b.chromeOsMinor) {
    if (!b.chromeOsMinor) return 1;
    if (!a.chromeOsMinor) return -1;
    return a.chromeOsMinor < b.chromeOsMinor ? -1 : 1;
  }
  if (a.chromeOsPatch !== b.chromeOsPatch) {
    if (!b.chromeOsPatch) return 1;
    if (!a.chromeOsPatch) return -1;
    return a.chromeOsPatch < b.chromeOsPatch ? -1 : 1;
  }
  return 0;
}

/*
 * Return list of existing Chrome milestones in reverse order (most recent i.e. largest to least).
 */
export async function getChromeMilestones(
  getManifestRefs = fetchChromiumOsManifestRefs
): Promise<number[]> {
  const output = await getManifestRefs();
  return parseChromiumOsManifestRefs(output);
}

function fetchChromiumOsManifestRefs(): Promise<string> {
  return new Promise((resolve, reject) => {
    https
      .get(
        'https://chromium.googlesource.com/chromiumos/manifest/+refs?format=TEXT',
        res => {
          const body: Buffer[] = [];
          res.on('data', (chunk: Buffer) => {
            body.push(chunk);
          });
          res.on('end', () => {
            resolve(Buffer.concat(body).toString());
          });
        }
      )
      .on('error', e => reject(e));
  });
}

function parseChromiumOsManifestRefs(output: string): number[] {
  // Each line in the output is a commit hash followed by ref name, in form of 'refs/heads/<name>'.
  const releaseBranchRe = /^\w+\srefs\/heads\/release-R(\d+)-(\d+)\.B$/;
  const matches: number[] = [];
  for (const line of output.split('\n')) {
    const m = releaseBranchRe.exec(line);
    if (m) {
      matches.push(Number(m[1]));
    }
  }
  return matches.sort((a, b) => a - b).reverse();
}

/**
 * Returns a list of prebuilt images available for the given board and image type, matching the
 * version pattern (all versions by default).
 * Returned versions are sorted in the reverse-chronological order (newest first).
 */
export async function listPrebuiltVersions(
  board: string,
  imageType: string,
  chrootService: services.chromiumos.ChrootService,
  logger: vscode.OutputChannel,
  versionPattern = '*'
): Promise<string[]> {
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

function parseFullCrosVersion(s: string): ImageVersion {
  const versionRegexp = /^R(\d+)-(\d+)\.(\d+)\.(\d+)(?:-(\d+)-(\d+))?$/;
  const match = versionRegexp.exec(s);
  if (!match) {
    throw new Error(`Invalid CrOS version string: ${s}`);
  }
  const image: ImageVersion = {
    chromeMilestone: parseInt(match[1]),
    chromeOsMajor: parseInt(match[2]),
    chromeOsMinor: parseInt(match[3]),
    chromeOsPatch: parseInt(match[4]),
    snapshotId: match[5],
    buildId: match[6],
  };
  return image;
}
