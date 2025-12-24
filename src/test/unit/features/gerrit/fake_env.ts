// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import MockAdapter from 'axios-mock-adapter';
import * as api from '../../../../features/gerrit/api';
import * as git from '../../../../features/gerrit/git';
import * as fakeData from './fake_data';

export type FakeGerritInitialOpts = Readonly<{
  accountsMe: api.AccountInfo;
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
  private readonly baseUrl: string;
  private readonly reqOpts: {headers: Record<string, string>};

  private readonly idToChangeInfo = new Map<
    string,
    {
      info: api.ChangeInfo;
      comments: api.FilePathToBaseCommentInfos;
      drafts: api.FilePathToBaseCommentInfos;
    }
  >();

  static initialize(
    mock: MockAdapter,
    opts: FakeGerritInitialOpts
  ): FakeGerrit {
    return new FakeGerrit(mock, opts);
  }

  /**
   * Processes `internal` option and sets up `/a/accounts/me`.
   */
  private constructor(
    private readonly mock: MockAdapter,
    opts: FakeGerritInitialOpts
  ) {
    this.baseUrl = opts?.internal ? CHROME_INTERNAL_GERRIT : CHROMIUM_GERRIT;

    this.reqOpts = opts?.internal ? CHROME_INTERNAL_OPTIONS : CHROMIUM_OPTIONS;

    this.registerFakeGet(opts.accountsMe);
    this.registerFakeDelete();
    this.registerFakePut();
  }

  /**
   * Sets up `/changes/<changeId>?o=ALL_REVISIONS`, `/changes/<changeId>/comments`,
   * and `/a/changes/<changeId>/drafts`.
   */
  setChange(
    id: string,
    info: api.ChangeInfo,
    comments: api.FilePathToBaseCommentInfos = {},
    drafts: api.FilePathToBaseCommentInfos = {}
  ): FakeGerrit {
    this.idToChangeInfo.set(id, {info, comments, drafts});
    return this;
  }

  private registerFakeGet(accountsMe: api.AccountInfo): void {
    this.mock
      .onGet(`${this.baseUrl}/a/accounts/me`, this.reqOpts)
      .reply(200, apiString(accountsMe));

    const urlRe = new RegExp(`${this.baseUrl}/((a/)?changes/(\\w*)[\\?/](.*))`);
    this.mock.onGet(urlRe, this.reqOpts).reply(async config => {
      const match = urlRe.exec(config.url!);
      if (!match) {
        return Promise.reject(`Unexpected call: ${config.url}`);
      }

      const id = match[3];
      const changeInfo = this.idToChangeInfo.get(id);
      if (!changeInfo) {
        return [404];
      }
      const path = match[1];
      switch (path) {
        case `changes/${id}?o=ALL_REVISIONS`:
          return [200, apiString(changeInfo.info)];
        case `changes/${id}/comments`:
          return [200, apiString(changeInfo.comments)];
        case `a/changes/${id}/drafts`:
          return [200, apiString(changeInfo.drafts)];
        default:
          return Promise.reject(`Unexpected call: ${config.url}`);
      }
    });
  }

  private registerFakeDelete(): void {
    this.mock.onDelete().reply(async config => {
      expect(config.headers).toEqual(
        jasmine.objectContaining(this.reqOpts.headers)
      );

      const deleteDraftRegex = new RegExp(
        `${this.baseUrl}/a/changes/([^/]+)/revisions/([^/]+)/drafts/([^/]+)`
      );
      const m = deleteDraftRegex.exec(config.url!);
      if (!m) throw new Error(`unexpected URL: ${config.url}`);

      const changeId = m[1];
      const revisionId = m[2];
      const commentId = m[3];

      const changeInfo = this.idToChangeInfo.get(changeId);
      if (!changeInfo) throw new Error(`Unknown change id: ${changeId}`);

      if (!changeInfo.drafts) {
        throw new Error(`draft comments not found in change ${changeId}`);
      }

      for (const [key, drafts] of Object.entries(changeInfo.drafts)) {
        const draftToDelete = drafts.find(x => x.id === commentId);
        if (!draftToDelete) continue;

        const wantRevisionId = changeInfo.info?.revisions?.[
          draftToDelete.commit_id!
        ]?._number as number;
        expect(revisionId).toEqual(wantRevisionId.toString());

        const i = drafts.indexOf(draftToDelete);
        const newComments = [...drafts.slice(0, i), ...drafts.slice(i + 1)];
        const newChangeInfo = {
          ...changeInfo,
          drafts: {
            ...changeInfo.drafts,
            [key]: newComments,
          },
        };
        this.idToChangeInfo.set(changeId, newChangeInfo);

        return [200];
      }

      throw new Error(`draft comment with id ${commentId} not found`);
    });
  }

  private registerFakePut(): void {
    this.mock.onPut().reply(async config => {
      expect(config.headers).toEqual(
        jasmine.objectContaining(this.reqOpts.headers)
      );

      const createOrUpdateDraftRegex = new RegExp(
        `^${this.baseUrl}/a/changes/([^/]+)/revisions/([^/]+)/drafts(?:/([^/]+))?$`
      );
      const m = createOrUpdateDraftRegex.exec(config.url!);
      if (!m) throw new Error(`Unexpected URL: ${config.url}`);

      const changeId = m[1];
      const revisionId = m[2];
      const draftIdToUpdate = m[3];

      const req = JSON.parse(config.data) as api.CommentInput;

      const changeInfo = this.idToChangeInfo.get(changeId);
      if (!changeInfo) throw new Error(`Unknown change id: ${changeId}`);

      const comments = changeInfo.comments?.[req.path];
      if (!comments) throw new Error(`Unexpected path: ${req.path}`);

      const target = comments.find(comment => comment.id === req.in_reply_to);
      if (!target) {
        throw new Error(`Unexpected in_reply_to: ${req.in_reply_to}`);
      }

      expect(req.in_reply_to).toEqual(target.id);

      const wantRevisionId = changeInfo.info?.revisions?.[target.commit_id!]
        ?._number as number;
      expect(revisionId).toEqual(wantRevisionId.toString());

      const unresolved = req.unresolved ?? target.unresolved;
      const createCommentInfo = unresolved
        ? fakeData.unresolvedCommentInfo
        : fakeData.resolvedCommentInfo;

      const commentInfo = createCommentInfo({
        line: target.line,
        range: target.range,
        message: req.message,
        commitId: target.commit_id,
        inReplyTo: req.in_reply_to,
      });

      const newDraftComments = [...(changeInfo.drafts?.[req.path] ?? [])];

      if (draftIdToUpdate) {
        const draftToUpdate = changeInfo.drafts?.[req.path]?.find(
          x => x.id === draftIdToUpdate
        );
        expect(draftToUpdate)
          .withContext(`draft with id ${draftIdToUpdate}`)
          .toBeDefined();

        newDraftComments.splice(newDraftComments.indexOf(draftToUpdate!), 1);
      }

      newDraftComments.push(commentInfo);

      changeInfo.drafts = {
        ...(changeInfo.drafts ?? {}),
        [req.path]: newDraftComments,
      };

      return [200, apiString(commentInfo)!];
    });
  }
}

/** Build Gerrit API response from typed input. */
function apiString(data: Object): string {
  return ')]}\n' + JSON.stringify(data);
}
