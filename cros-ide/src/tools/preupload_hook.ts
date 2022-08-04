// Copyright 2022 The ChromiumOS Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as commonUtil from '../common/common_util';

async function main(commitHash: string | undefined) {
  if (!commitHash) {
    throw Error('PRESUBMIT_COMMIT environment variable is not set');
  }

  const gitRevParse = await commonUtil.exec('git', ['rev-parse', 'HEAD']);
  if (gitRevParse instanceof Error) {
    throw gitRevParse;
  }
  const headHash = gitRevParse.stdout.trim();
  if (commitHash !== headHash) {
    // We test only HEAD. If multiple commits are sent together we skip testing
    // intermediate commits. This is not ideal, but for testing an intermediate
    // commit, we need to checkout the commit, which pollutes user's git reflog.
    return;
  }

  if (commonUtil.isInsideChroot()) {
    throw new Error(
      'Cannot test cros-ide inside chroot; please run repo ' +
        'upload outside chroot'
    );
  }

  const gitStatus = await commonUtil.exec('git', ['status', '--short']);
  if (gitStatus instanceof Error) {
    throw gitStatus;
  }
  if (gitStatus.stdout) {
    throw new Error(
      'Tests cannot run on dirty git status ' + '(consider running git stash)'
    );
  }

  const nodeVersion = await commonUtil.exec('node', ['--version']);
  if (nodeVersion instanceof Error) {
    throw nodeVersion;
  }
  if (!nodeVersion.stdout.startsWith('v14.')) {
    throw new Error(
      'Node version should be v14. (Hint: use nvm to install the version locally)'
    );
  }

  const npmRunPreupload = await commonUtil.exec('npm', ['run', 'preupload'], {
    logger: new (class {
      append(s: string): void {
        console.error(s);
      }
    })(),
    logStdout: true,
  });
  if (npmRunPreupload instanceof Error) {
    throw npmRunPreupload;
  }
}

if (require.main === module) {
  main(process.env.PRESUBMIT_COMMIT).catch(e => {
    console.error(e);
    // eslint-disable-next-line no-process-exit
    process.exit(1);
  });
}
