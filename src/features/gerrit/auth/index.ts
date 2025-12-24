// Copyright 2025 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {RepoId} from '../git';
import {Sink} from '../sink';
import {readAuthCookie} from './auth';
import {AuthClientGitCookies} from './auth_client_gitcookies';
import {AuthClientSso} from './auth_client_sso';
import type {AuthClient} from './auth_client';

export type {AuthClient} from './auth_client';

export async function createAuthClient(
  repoId: RepoId,
  sink: Sink
): Promise<AuthClient> {
  const authCookie = await readAuthCookie(repoId, sink);
  if (!authCookie) {
    return new AuthClientSso();
  }
  return new AuthClientGitCookies(authCookie);
}
