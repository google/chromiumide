// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as api from '../api';
import * as git from '../git';
import * as helpers from '../helpers';
import {Revision} from './revision';

/**
 * Gerrit change
 */
export class Change {
  readonly revisions: CommitIdToRevision;
  constructor(
    localCommitId: string,
    repoId: git.RepoId,
    private readonly changeInfo: api.ChangeInfo,
    commentInfosMap: api.FilePathToCommentInfos
  ) {
    const revisions = changeInfo.revisions ?? {};
    const splitCommentInfosMap: Map<string, api.FilePathToCommentInfos> =
      helpers.splitPathArrayMap(commentInfosMap, c => c.commit_id!);
    const revisionsMap: {[commitId: string]: Revision} = {};
    for (const [commitId, revisionInfo] of Object.entries(revisions)) {
      const rCommentInfosMap = splitCommentInfosMap.get(commitId) ?? {};
      revisionsMap[commitId] = new Revision(
        localCommitId,
        repoId,
        this.changeId,
        this.changeNumber,
        commitId,
        revisionInfo,
        rCommentInfosMap
      );
    }
    this.revisions = revisionsMap;
  }

  private get changeId(): string {
    return this.changeInfo.change_id;
  }
  private get changeNumber(): number {
    return this.changeInfo._number;
  }

  equals(other: Change): boolean {
    if (this.changeId !== other.changeId) return false;
    if (
      Object.keys(this.revisions).length !== Object.keys(other.revisions).length
    )
      return false;
    for (const [commitId, revision] of Object.entries(this.revisions)) {
      const r = other.revisions[commitId];
      if (!r) return false;
      if (!revision.equals(r)) return false;
    }
    return true;
  }
}

/**
 * Map from the commit id to Revision
 */
type CommitIdToRevision = Readonly<{
  [commitId: string]: Revision;
}>;
