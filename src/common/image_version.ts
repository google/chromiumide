// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {getDriver} from '../../shared/app/common/driver_repository';
import {Https} from './https';

const driver = getDriver();

/*
 * Regex to parse a CrOS image string in form Rxxx-yyyyy.zzz.www (release image) or
 * Rxxx-yyyyy.zzz.www-aaaaa-bbbbbbbbbbbbbb (non-release prebuilt image with snapshot and build id,
 * such as snapshot, postsubmit, and cq images).
 *
 * It could be combined with other pattern e.g.
 * for a string consists only of the image:
 *   const crosImageOnlyRe = new Regexp(`^${CROS_IMAGE_VERSION_RE_SRC}$`);
 * or for a builder path:
 *   const builderImageRe = new Regexp(`${board}-${builder}/${CROS_IMAGE_VERSION_RE_SRC}$`);
 *
 * If a parsed ImageVersion object is wanted, enclose it with () to capture the string and pass the
 * matched persion to `parseFullCrOSVersion()`, e.g.
 *   const builderImageRe = new Regexp(`hatch-release/(${CROS_IMAGE_VERSION_RE_SRC})$`);
 *   const match = builderImageRe.exec('hatch-release/R1-2.3.4');
 *   // Returns {chromeMilestone: 1, chromeOsMajor: 2, chromeOsMinor: 3, chromeOsPatch: 4}.
 *   if (match) return parseFullCrosVersion(match[1]);
 */
export const CROS_IMAGE_VERSION_RE_SRC = /R\d+-\d+\.\d+\.\d+(?:-\d+-\d+)?/
  .source;

const CROS_IMAGE_VERSION_CAPTURE_RE =
  /^R(\d+)-(\d+)\.(\d+)\.(\d+)(?:-(\d+)-(\d+))?$/;

export type ImageVersion = {
  chromeMilestone: number;
  chromeOsMajor?: number;
  chromeOsMinor?: number;
  chromeOsPatch?: number;
  snapshotId?: string;
  buildId?: string;
};

export function compareCrosVersions(a: ImageVersion, b: ImageVersion): number {
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
  const output = await getManifestRefs().catch(error => {
    // If failed to get manifest content, return '', and parseChromiumOsManifestRefs will return an
    // empty list, so that user can continue with the image path selection process by manually
    // inputing the milestone they want.
    // Report error to metrics for investigation.
    driver.metrics.send({
      category: 'error',
      group: 'device',
      name: 'device_management_fetch_manifest_refs_error',
      description: error.message,
    });
    return '';
  });
  const milestones = parseChromiumOsManifestRefs(output);
  // The ChromiumOS manifest contains only the milestones after branch point, but there is always a
  // newer milestone in development (i.e. release and postsubmit builders for it exist).
  // See go/chrome-cycle.
  if (milestones.length > 0) milestones.unshift(milestones[0] + 1);
  return milestones;
}

async function fetchChromiumOsManifestRefs(): Promise<string> {
  return await Https.getOrThrow(
    'https://chromium.googlesource.com/chromiumos/manifest/+refs?format=TEXT'
  );
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

export function parseFullCrosVersion(s: string): ImageVersion {
  const match = CROS_IMAGE_VERSION_CAPTURE_RE.exec(s);
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
