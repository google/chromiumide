// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as path from 'path';
import * as semver from 'semver';
import * as commonUtil from '../src/common/common_util';

const USAGE = `
 Usage:
  release.sh [command] [options]

 Commands:

  publish
     Builds and releases the extension.

  update
     Updates the version and commits the change for review.

  help
     Prints this message.

 Options:

  --pre-release
     Run the command for pre-release.

  --extra-message
     Additional text to be added to the version update commit message.
     This option is meaningful only for the update command.

  --remote-branch
     Specify the remote release branch such as refs/ide/0.4.0 .
     This option is meaningful only for the publish command.
`;

async function execute(
  name: string,
  args: string[],
  opts?: {
    logStdout?: boolean;
    cwd?: string;
  }
): Promise<string> {
  const res = await commonUtil.exec(name, args, {
    logger: new (class {
      append(s: string): void {
        process.stderr.write(s);
      }
    })(),
    logStdout: opts?.logStdout,
    cwd: opts?.cwd,
  });
  if (res instanceof Error) {
    throw res;
  }
  return res.stdout;
}

async function currentVersion(): Promise<semver.SemVer> {
  const version = JSON.parse(fs.readFileSync('./package.json', 'utf8')).version;
  return new semver.SemVer(version);
}

/**
 * Verify that HEAD change is merged and it updated the version in package.json
 */
async function assertHeadUpdatesVersion(remoteBranch?: string) {
  let mergedRevision: string;
  if (remoteBranch) {
    await execute('git', [
      'fetch',
      'https://chromium.googlesource.com/chromiumos/chromite',
      remoteBranch,
    ]);
    mergedRevision = 'FETCH_HEAD';
  } else {
    mergedRevision = 'cros/main';
  }

  // IDE_CROS_MAIN_FOR_TESTING substitutes the branch for manual testing.
  const revision = process.env.IDE_CROS_MAIN_FOR_TESTING || mergedRevision;
  try {
    // Assert HEAD is already merged, i.e. an ancestor a remote branch.
    await execute('git', ['merge-base', '--is-ancestor', 'HEAD', revision]);
  } catch (_e) {
    throw new Error(`HEAD should be an ancestor of ${revision}`);
  }

  // HEAD commit should update version in package.json .
  const diff = await execute('git', [
    'diff',
    '-p',
    'HEAD~',
    '--',
    '**package.json',
  ]);
  if (!/^\+\s*"version"\s*:/m.test(diff)) {
    throw new Error('HEAD commit should update version in package.json');
  }
}

/*
 * Asserts the working directory is clean.
 */
async function assertCleanGitStatus() {
  if (await execute('git', ['status', '--short'])) {
    throw new Error('dirty git status; run the command in clean environment');
  }
}

/**
 * We use even minor version for release and odd minor version for pre-release following
 * https://code.visualstudio.com/api/working-with-extensions/publishing-extension#prerelease-extensions
 */
function expectedMinorVersionParity(preRelease: boolean) {
  return preRelease ? 1 : 0;
}

/**
 * Returns whether the version matches the expectation for the release type.
 */
function hasCorrectMinorVersion(version: semver.SemVer, preRelease: boolean) {
  const minorVersionParity = version.minor % 2;
  return minorVersionParity === expectedMinorVersionParity(preRelease);
}

type UpdateKind = 'minor' | 'patch';

function nextUpdateKind(
  current: semver.SemVer,
  preRelease: boolean
): UpdateKind {
  if (hasCorrectMinorVersion(current, preRelease)) {
    return 'patch';
  } else {
    return 'minor';
  }
}

async function bumpVersion(preRelease: boolean): Promise<semver.SemVer> {
  return new semver.SemVer(
    await execute('npm', [
      'version',
      nextUpdateKind(await currentVersion(), preRelease),
    ])
  );
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

async function updateChangelogForRelease(version: semver.SemVer) {
  const changeLogFile = './CHANGELOG.md';

  const changeLog = (await fs.promises.readFile(changeLogFile, 'utf8')).split(
    '\n'
  );

  const header = changeLog.slice(0, 2);
  const body = changeLog.slice(2);

  const now = new Date();
  const month = MONTH_NAMES[now.getMonth()];
  const releaseDate = `${month} ${now.getFullYear()}`;
  const insertion = `## ${version} (${releaseDate})

- FIXME: fill in the update
`;

  console.log(
    `*** Please manually update ${changeLogFile} before submitting the change. ***`
  );

  const updatedText = [...header, insertion, ...body].join('\n');

  await fs.promises.writeFile(changeLogFile, updatedText, 'utf8');
}

async function updateVersionAndCommit(
  preRelease: boolean,
  extraMessage: string
) {
  await assertCleanGitStatus();
  const version = await bumpVersion(preRelease);

  if (!preRelease) {
    await updateChangelogForRelease(version);
  }

  // Prepend and append by a new line if given non-empty extra messages to
  // format it as a stand-alone paragraph.
  const additionalLines =
    (extraMessage.length > 0 ? '\n' : '') +
    extraMessage +
    (extraMessage.length > 0 ? '\n' : '');

  const release = preRelease ? 'pre-release' : 'release';
  const test = preRelease ? 'None' : 'Bugfest';
  await execute('git', [
    'commit',
    '-a',
    '-m',
    `ide: Bump the version to ${version} for ${release}

Commit generated by cros-ide/release.sh .
${additionalLines}
BUG=b:246668828
TEST=${test}
`,
  ]);
}

async function build(tempDir: string, preRelease: boolean): Promise<string> {
  const args = ['vsce', 'package', '-o', `${tempDir}/`];
  if (preRelease) {
    args.push('--pre-release');
  }
  await execute('npx', args);
  const localName: string = (await fs.promises.readdir(tempDir))[0];
  return path.join(tempDir, localName);
}

async function buildAndUpload(preRelease: boolean, remoteBranch?: string) {
  if (!process.env.OVSX_PAT || !process.env.VSCE_PAT) {
    throw new Error('Set OVSX_PAT and VSCE_PAT: read go/chromiumide-release');
  }

  await assertCleanGitStatus();
  await assertHeadUpdatesVersion(remoteBranch);

  const version = await currentVersion();
  if (!hasCorrectMinorVersion(version, preRelease)) {
    const expectation =
      expectedMinorVersionParity(preRelease) === 0 ? 'even' : 'odd';
    throw new Error(
      `Bad version ${version}: minor version must be ${expectation}`
    );
  }

  await commonUtil.withTempDir(async td => {
    const vsixFile = await build(td, preRelease);
    const fileName = path.basename(vsixFile);

    const ovsxArgs = ['ovsx', 'publish', vsixFile];
    const vsceArgs = ['vsce', 'publish', '-i', vsixFile];
    if (preRelease) {
      vsceArgs.push('--pre-release');
    }

    console.log(`Publishing ${fileName} to OpenVSX`);

    try {
      await execute('npx', ovsxArgs);
    } catch (e) {
      console.error(e);
    }

    console.log(`Publishing ${fileName} to MS Marketplace`);

    try {
      await execute('npx', vsceArgs);
    } catch (e) {
      console.error(e);
    }
  });
}

type Command = 'publish' | 'update' | 'help';
const ALL_COMMANDS: Command[] = ['publish', 'update', 'help'];

type Config = {
  command: Command;
  preRelease: boolean;
  // Name of the remote branch for patch release. e.g. refs/ide/0.4.0
  remoteBranch?: string;
  // Additional message to be added to version update commit message.
  extraMessage?: string;
};

/**
 * Parse args.
 *
 * @throws Error on invalid input
 */
export function parseArgs(args: string[]): Config {
  // Skip ts-node release.ts
  args = args.slice(2);

  const command = args.shift() as Command;
  if (!ALL_COMMANDS.includes(command)) {
    throw new Error(`Unknown command ${command}; see help`);
  }
  while (args.length > 0 && !args[0].startsWith('--')) {
    args.shift();
  }

  let preRelease = false;
  let remoteBranch = undefined;
  let extraMessage = undefined;
  while (args.length > 0) {
    const flag = args.shift();
    switch (flag) {
      case '--pre-release':
        preRelease = true;
        break;
      case '--remote-branch':
        remoteBranch = args.shift();
        break;
      case '--extra-message':
        extraMessage = args.shift();
        break;
      default:
        throw new Error(`Unknown flag ${flag}; see help`);
    }
  }
  return {
    command,
    preRelease,
    remoteBranch,
    extraMessage,
  };
}

// TODO(oka): Refactor the module and add tests.
async function main() {
  const config = parseArgs(process.argv);
  switch (config.command) {
    case 'help':
      console.log(USAGE);
      return;
    case 'publish':
      await buildAndUpload(config.preRelease, config.remoteBranch);
      return;
    case 'update':
      await updateVersionAndCommit(
        config.preRelease,
        config.extraMessage ?? ''
      );
      return;
  }
}

if (require.main === module) {
  main().catch(e => {
    console.error(e);
    // eslint-disable-next-line no-process-exit
    process.exit(1);
  });
}
