// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

export class CompdbError extends Error {
  constructor(readonly details: CompdbErrorDetails) {
    super(details.kind + (details.reason ? ': ' + details.reason.message : ''));
  }
}

export type CompdbErrorDetails = {reason?: Error} & (
  | {
      kind: CompdbErrorKind.RemoveCache;
      cache: string;
    }
  | {
      kind: CompdbErrorKind.RunEbuild;
    }
  | {
      kind: CompdbErrorKind.NotGenerated;
    }
  | {
      kind: CompdbErrorKind.CopyFailed;
      destination: string;
    }
);

export enum CompdbErrorKind {
  RemoveCache = 'failed to remove cache files before running ebuild',
  RunEbuild = 'failed to run ebuild to generate compilation database',
  NotGenerated = 'compilation database was not generated',
  CopyFailed = 'failed to copy compilation database to the source directory',
}
