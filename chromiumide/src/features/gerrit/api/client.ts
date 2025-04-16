// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {AxiosError} from 'axios';
import {Https, HttpsError} from '../../../common/https';
import {AuthClient} from '../auth';
import * as git from '../git';
import type * as api from '.';

/**
 * Provides primitive methods to call Gerrit REST APIs.
 */
export class RawGerritClient {
  /**
   * Gets a raw string from Gerrit REST API with an auth cookie.
   * It can throw an error from https.getOrThrow. Catch 404 (not found) error and return undefined
   * as a special case that a local change has not been uploaded to gerrit yet, re-throw all other
   * errors.
   */
  async fetchOrThrow<T>(
    repoId: git.RepoId,
    path: string,
    authClient?: AuthClient
  ): Promise<T | undefined> {
    const url = `${git.gerritUrl(repoId)}/${path}`;

    let str;
    if (authClient) {
      str = await authClient
        .request({
          method: 'GET',
          url,
        })
        .catch((e: AxiosError) => {
          if (e.status === 404) {
            return undefined;
          } else {
            throw e;
          }
        });
    } else {
      str = await Https.getOrThrow(url).catch((error: HttpsError) => {
        if (error.statusCode === 404) {
          return undefined;
        }
        throw error;
      });
    }

    return str === undefined ? undefined : parseResponse(str);
  }
}

/**
 * Provides custom APIs which use Gerrit REST APIs under the hood.
 */
export class GerritClient {
  private readonly client = new RawGerritClient();

  constructor() {}

  /** Fetches the user's account info */
  async fetchMyAccountInfoOrThrow(
    repoId: git.RepoId,
    authClient?: AuthClient
  ): Promise<api.AccountInfo | undefined> {
    return this.client.fetchOrThrow(repoId, 'a/accounts/me', authClient);
  }

  /** Fetches the change with all revisions */
  async fetchChangeOrThrow(
    repoId: git.RepoId,
    changeId: string,
    authClient?: AuthClient
  ): Promise<api.ChangeInfo | undefined> {
    return await this.client.fetchOrThrow(
      repoId,
      `changes/${encodeURIComponent(changeId)}?o=ALL_REVISIONS`,
      authClient
    );
  }

  /** Fetches all public comments of the change */
  async fetchPublicCommentsOrThrow(
    repoId: git.RepoId,
    changeId: string,
    authClient?: AuthClient
  ): Promise<api.FilePathToCommentInfos | undefined> {
    const baseCommentInfosMap: api.FilePathToBaseCommentInfos | undefined =
      await this.client.fetchOrThrow(
        repoId,
        `changes/${encodeURIComponent(changeId)}/comments`,
        authClient
      );
    if (!baseCommentInfosMap) return undefined;

    const res: {[filePath: string]: api.CommentInfo[]} = {};
    for (const [filePath, baseCommentInfos] of Object.entries(
      baseCommentInfosMap
    )) {
      res[filePath] = baseCommentInfos.map(c => ({
        ...c,
        author: c.author!,
        isPublic: true,
      }));
    }
    return res;
  }

  /** Fetches all draft comments of the change */
  async fetchDraftCommentsOrThrow(
    repoId: git.RepoId,
    changeId: string,
    myAccountInfo: api.AccountInfo,
    authClient?: AuthClient
  ): Promise<api.FilePathToCommentInfos | undefined> {
    const baseCommentInfosMap: api.FilePathToBaseCommentInfos | undefined =
      await this.client.fetchOrThrow(
        repoId,
        `a/changes/${encodeURIComponent(changeId)}/drafts`,
        authClient
      );
    if (!baseCommentInfosMap) return undefined;

    const res: {[filePath: string]: api.CommentInfo[]} = {};
    for (const [filePath, baseCommentInfos] of Object.entries(
      baseCommentInfosMap
    )) {
      res[filePath] = baseCommentInfos.map(c => ({
        ...c,
        author: myAccountInfo,
        isPublic: false,
      }));
    }
    return res;
  }
}

export function parseResponse<T>(res: string): T {
  return JSON.parse(res.substring(')]}\n'.length));
}
