// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as api from '../../../../features/gerrit/api';
import * as git from '../../../../features/gerrit/git';
import * as https from '../../../../features/gerrit/https';

export type FakeGerritInitialOpts = Readonly<{
  accountsMe?: api.AccountInfo;
  internal?: boolean;
}>;

function COOKIE(repoId: git.RepoId): string {
  return `o=git-ymat.google.com=${
    repoId === 'cros' ? 'chromium-newtoken' : 'chrome-internal-newtoken'
  }`;
}

function OPTIONS(repoId: git.RepoId) {
  return {
    headers: {
      cookie: COOKIE(repoId),
    },
  };
}
const CHROMIUM_OPTIONS = OPTIONS('cros');
const CHROME_INTERNAL_OPTIONS = OPTIONS('cros-internal');

const CHROMIUM_GERRIT = 'https://chromium-review.googlesource.com';
const CHROME_INTERNAL_GERRIT =
  'https://chrome-internal-review.googlesource.com';

/** Fluent helper for creating mocking `http.getOrThrow`. */
export class FakeGerrit {
  private readonly httpsSpy;
  private readonly baseUrl;
  private readonly reqOpts;

  static initialize(opts?: FakeGerritInitialOpts): FakeGerrit {
    return new this(opts);
  }

  /**
   * Processes `internal` option and sets up `/accounts/me`.
   */
  private constructor(opts?: FakeGerritInitialOpts) {
    this.baseUrl = opts?.internal ? CHROME_INTERNAL_GERRIT : CHROMIUM_GERRIT;

    this.reqOpts = opts?.internal ? CHROME_INTERNAL_OPTIONS : CHROMIUM_OPTIONS;

    this.httpsSpy = spyOn(https, 'getOrThrow')
      .withArgs(`${this.baseUrl}/accounts/me`, this.reqOpts)
      .and.resolveTo(apiString(opts?.accountsMe));
  }

  /**
   * Sets up `/changes/<changeId>?o=ALL_REVISIONS`, `/changes/<changeId>/comments`,
   * and `/changes/<changeId>/drafts`.
   */
  setChange(c: {
    id: string;
    info?: api.ChangeInfo;
    comments?: api.FilePathToBaseCommentInfos;
    drafts?: api.FilePathToBaseCommentInfos;
  }) {
    this.httpsSpy
      .withArgs(`${this.baseUrl}/changes/${c.id}?o=ALL_REVISIONS`, this.reqOpts)
      .and.resolveTo(apiString(c.info))
      .withArgs(`${this.baseUrl}/changes/${c.id}/comments`, this.reqOpts)
      .and.resolveTo(apiString(c.comments))
      .withArgs(`${this.baseUrl}/changes/${c.id}/drafts`, this.reqOpts)
      .and.resolveTo(apiString(c.drafts));

    return this;
  }
}

/** Build Gerrit API response from typed input. */
function apiString(data?: Object): string | undefined {
  if (!data) {
    return undefined;
  }
  return ')]}\n' + JSON.stringify(data);
}
