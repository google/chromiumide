// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as commonUtil from '../../common/common_util';
import * as git from '../../features/gerrit/git';

/**
 * For operating on Git repos created in test (which typically live in /tmp).
 *
 * All functions throw errors.
 */
export class Git {
  constructor(readonly root: string) {}

  /** Creates the root directory and runs `git init`. */
  async init(opts?: {repoId?: git.RepoId}): Promise<void> {
    await fs.promises.mkdir(this.root, {recursive: true});
    await commonUtil.execOrThrow('git', ['init', '--initial-branch=main'], {
      cwd: this.root,
    });
    const repoId = opts?.repoId ?? 'cros';
    const remoteName = repoId === 'chromium' ? 'origin' : repoId;
    const remoteUrl =
      repoId === 'cros' || repoId === 'chromium'
        ? 'https://chromium.googlesource.com/foo'
        : 'https://chrome-internal.googlesource.com/foo';
    await commonUtil.execOrThrow(
      'git',
      ['remote', 'add', remoteName, remoteUrl],
      {
        cwd: this.root,
      }
    );
  }

  async addAll(): Promise<void> {
    await commonUtil.execOrThrow('git', ['add', '.'], {cwd: this.root});
  }

  async checkout(name: string, opts?: {createBranch?: boolean}): Promise<void> {
    const args = ['checkout', ...cond(opts?.createBranch, '-b'), name];
    await commonUtil.execOrThrow('git', args, {cwd: this.root});
  }

  /** Run `git branch --set-upstream-to <upstream>`. */
  async setUpstreamTo(upstream: string): Promise<void> {
    await commonUtil.execOrThrow(
      'git',
      ['branch', '--set-upstream-to', upstream],
      {
        cwd: this.root,
      }
    );
  }

  /** Run git commit and returns commit hash. */
  async commit(
    message: string,
    opts?: {amend?: boolean; all?: boolean}
  ): Promise<string> {
    const args = [
      'commit',
      '--allow-empty',
      ...cond(opts?.amend, '--amend'),
      ...cond(opts?.all, '--all'),
      '-m',
      message,
    ];
    await commonUtil.execOrThrow('git', args, {
      cwd: this.root,
    });
    return await this.getCommitId();
  }

  async getCommitId(revision = 'HEAD'): Promise<string> {
    return (
      await commonUtil.execOrThrow('git', ['rev-parse', revision], {
        cwd: this.root,
      })
    ).stdout.trim();
  }

  /** Creates cros(-internal)/main and sets main to track it. */
  async setupCrosBranches(opts?: {internal?: boolean}): Promise<void> {
    const crosMain = opts?.internal ? 'cros-internal/main' : 'cros/main';
    await this.checkout(crosMain, {createBranch: true});
    await this.checkout('main');
    await this.setUpstreamTo(crosMain);
  }
}

function cond(test: boolean | undefined, value: string): string[] {
  return test ? [value] : [];
}
