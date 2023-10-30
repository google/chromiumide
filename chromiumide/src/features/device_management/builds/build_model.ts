// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/** Information on uploaded pre-built ChromeOS (as found in go/goldeneye) */
export type PrebuildInfo = {
  readonly buildDate: Date;
  readonly chromeVersion: string;
  readonly chromeMilestone: string;
  readonly chromeOsVersion: string;
  readonly arcVersion: string;
  readonly arcBranch: string;
  readonly buildChannel: BuildChannel;
  readonly boardName: string;
  readonly modelName: string;
  readonly releaseName: string;
  readonly kernelVersion: string;
  readonly signedBuildId: string;
  readonly arcUseSet: string;
};

export type BuildChannel = 'canary' | 'dev' | 'beta' | 'stable';

/** Parses a BuildInfo from JSON (with correct field types such as Date). */
export function parseBuildInfoFromJson(json: string): PrebuildInfo {
  return fixParsedBuildInfo(JSON.parse(json) as PrebuildInfo);
}

/** Assures fields have correct non-string types, e.g. after JSON.parse(). */
export function fixParsedBuildInfo(buildInfo: PrebuildInfo): PrebuildInfo {
  return {
    ...buildInfo,
    buildDate: new Date(buildInfo.buildDate),
  };
}
