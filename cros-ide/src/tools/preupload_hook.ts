import * as commonUtil from '../common/common_util';

async function main(commitHash: string | undefined) {
  if (!commitHash) {
    throw Error('PRESUBMIT_COMMIT environment variable is not set');
  }
  const headHash = (await commonUtil.exec('git', ['rev-parse', 'HEAD'])).trim();
  if (commitHash !== headHash) {
    // We test only HEAD. If multiple commits are sent together we skip testing
    // intermediate commits. This is not ideal, but for testing an intermediate
    // commit, we need to checkout the commit, which pollutes user's git reflog.
    return;
  }
  if (commonUtil.isInsideChroot()) {
    throw new Error('Cannot test cros-ide inside chroot; please run repo ' +
      'upload outside chroot');
  }
  if (await commonUtil.exec('git', ['status', '--short'])) {
    throw new Error('Tests cannot run on dirty git status ' +
      '(consider running git stash)');
  }
  if (!(await commonUtil.exec('node', ['--version'])).startsWith('v12.')) {
    throw new Error('Node version should be v12.*');
  }
  await commonUtil.exec('npm', ['run', 'test'], console.error,
      {logStdout: true});
}

if (require.main === module) {
  main(process.env.PRESUBMIT_COMMIT).catch(e => {
    console.error(e);
    process.exit(1);
  });
}
