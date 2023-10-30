// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as https from 'https';
import * as api from '../../../../features/gerrit/api';
import * as git from '../../../../features/gerrit/git';
import {Https} from '../../../../features/gerrit/https';
import * as fakeData from './fake_data';

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
  private readonly httpsGetSpy: jasmine.Spy<typeof Https.getOrThrow>;
  private readonly httpsDeleteSpy: jasmine.Spy<typeof Https.deleteOrThrow>;
  private readonly httpsPutSpy: jasmine.Spy<typeof Https.putJsonOrThrow>;

  private readonly baseUrl: string;
  private readonly reqOpts: https.RequestOptions;

  private readonly idToChangeInfo = new Map<
    string,
    {
      info?: api.ChangeInfo;
      comments?: api.FilePathToBaseCommentInfos;
      drafts?: api.FilePathToBaseCommentInfos;
    }
  >();

  static initialize(opts?: FakeGerritInitialOpts): FakeGerrit {
    return new this(opts);
  }

  /**
   * Processes `internal` option and sets up `/a/accounts/me`.
   */
  private constructor(opts?: FakeGerritInitialOpts) {
    this.baseUrl = opts?.internal ? CHROME_INTERNAL_GERRIT : CHROMIUM_GERRIT;

    this.reqOpts = opts?.internal ? CHROME_INTERNAL_OPTIONS : CHROMIUM_OPTIONS;

    this.httpsGetSpy = spyOn(Https, 'getOrThrow')
      .withArgs(`${this.baseUrl}/a/accounts/me`, this.reqOpts)
      .and.resolveTo(apiString(opts?.accountsMe));
    this.httpsDeleteSpy = spyOn(Https, 'deleteOrThrow');
    this.httpsPutSpy = spyOn(Https, 'putJsonOrThrow');

    this.registerFakeDelete();
    this.registerFakePut();
  }

  /**
   * Sets up `/changes/<changeId>?o=ALL_REVISIONS`, `/changes/<changeId>/comments`,
   * and `/a/changes/<changeId>/drafts`.
   */
  setChange(c: {
    id: string;
    info?: api.ChangeInfo;
    comments?: api.FilePathToBaseCommentInfos;
    drafts?: api.FilePathToBaseCommentInfos;
  }): FakeGerrit {
    const {id, info, comments, drafts} = c;

    this.idToChangeInfo.set(id, {info, comments, drafts});

    this.httpsGetSpy
      .withArgs(`${this.baseUrl}/changes/${c.id}?o=ALL_REVISIONS`, this.reqOpts)
      .and.callFake(async () => apiString(this.idToChangeInfo.get(c.id)?.info))
      .withArgs(`${this.baseUrl}/changes/${c.id}/comments`, this.reqOpts)
      .and.callFake(async () =>
        apiString(this.idToChangeInfo.get(c.id)?.comments)
      )
      .withArgs(`${this.baseUrl}/a/changes/${c.id}/drafts`, this.reqOpts)
      .and.callFake(async () =>
        apiString(this.idToChangeInfo.get(c.id)?.drafts)
      );

    return this;
  }

  private registerFakeDelete(): void {
    this.httpsDeleteSpy.and.callFake(async (url, options): Promise<void> => {
      expect(options).toEqual(this.reqOpts);

      const deleteDraftRegex = new RegExp(
        `${this.baseUrl}/a/changes/([^/]+)/revisions/([^/]+)/drafts/([^/]+)`
      );
      const m = deleteDraftRegex.exec(url);
      if (!m) throw new Error(`unexpected URL: ${url}`);

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

        return;
      }

      throw new Error(`draft comment with id ${commentId} not found`);
    });
  }

  private registerFakePut(): void {
    this.httpsPutSpy.and.callFake(async (url, postData, options) => {
      expect(options).toEqual(this.reqOpts);

      const createOrUpdateDraftRegex = new RegExp(
        `^${this.baseUrl}/a/changes/([^/]+)/revisions/([^/]+)/drafts(?:/([^/]+))?$`
      );
      const m = createOrUpdateDraftRegex.exec(url);
      if (!m) throw new Error(`Unexpected URL: ${url}`);

      const changeId = m[1];
      const revisionId = m[2];
      const draftIdToUpdate = m[3];

      const req = postData as api.CommentInput;

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

      return apiString(commentInfo)!;
    });
  }
}

/** Build Gerrit API response from typed input. */
function apiString(data?: Object): string | undefined {
  if (!data) {
    return undefined;
  }
  return ')]}\n' + JSON.stringify(data);
}
