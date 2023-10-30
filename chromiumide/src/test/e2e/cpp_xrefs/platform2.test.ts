// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {BoardOrHost} from '../../../common/chromiumos/board_or_host';
import {getQualifiedPackageName} from '../../../common/chromiumos/portage/ebuild';
import {CompdbServiceImpl} from '../../../features/chromiumos/cpp_code_completion/compdb_service';
import {
  ChrootService,
  PackageInfo,
  Packages,
} from '../../../services/chromiumos';
import * as testing from '../../testing';
import {VoidOutputChannel} from '../../testing/fakes';
import {getChromiumosDirectory} from '../common/fs';

// Platform2 directories to ignore on listing C++ files.
const IGNORED_DIRS = [
  // TODO(b:289171071): following packages are compiled with Makefile.
  'avtest_label_detect',
  'hwsec-optee-ta',
  'wifi-testbed',
  // Ebuild not found for the following packages.
  'arc/container/file-syncer', // very new project as of 2023-06-28
  'authpolicy', // ebuild removed on crrev.com/c/4542250
  'media_capabilities', // ebuild has not been merged crrev.com/c/2386943
  'media_perception', // the package will be removed crrev.com/c/4348315
];

// Platform2 packages for which we test generation of compdb works.
// We apply this filtering so that test doesn't take too long.
const PACKAGES_TO_TEST_COMPDB_GENERATION: string[] = [
  'chromeos-base/attestation',
  'chromeos-base/chaps',
  'chromeos-base/chromeos-imageburner',
  'chromeos-base/codelab',
  'chromeos-base/crash-reporter',
  'chromeos-base/cros-camera-libs',
  'chromeos-base/cros-camera',
  'chromeos-base/cros-disks',
  'chromeos-base/cryptohome',
  'chromeos-base/diagnostics',
  'chromeos-base/imageloader',
  'chromeos-base/missive',
  'chromeos-base/power_manager',
  'chromeos-base/shill',
  'chromeos-base/vm_host_tools',
];

describe('C++ xrefs in platform2', () => {
  testing.installVscodeDouble();

  const chromiumos = getChromiumosDirectory();

  it('expects chroot to exist', () => {
    expect(fs.existsSync(path.join(chromiumos, 'chroot'))).toBeTrue();
  });

  const chrootService = ChrootService.maybeCreate(chromiumos, false)!;
  const packages = Packages.getOrCreate(chrootService);

  // Create a test case for each platform2 directory containing a C++ file.
  const platform2 = path.join(chromiumos, 'src/platform2');

  const representatives = [
    ...listCppFileRepresentatives(
      platform2,
      IGNORED_DIRS.map(x => path.join(platform2, x))
    ),
  ];

  for (const cppFile of representatives) {
    it(
      `for ${cppFile} can find package to compile`,
      async () => {
        const packageInfo = await packages.fromFilepath(cppFile);

        expect(packageInfo).toBeTruthy();
      },
      // Initial call to packages.fromFilepath takes about 30 seconds.
      60 * 1000
    );
  }

  const board = BoardOrHost.newBoard('amd64-generic');

  const output = new VoidOutputChannel();
  const compdbService = new CompdbServiceImpl(output, {
    chroot: chrootService.chroot,
    out: chrootService.out,
    source: chrootService.source,
  });

  const seenPackageInfo: PackageInfo[] = [];

  type GenerateCompdbJobResult =
    | {packageName: string; error?: Error}
    | undefined;

  // For each C++ file in representatives, compute the package the file belongs to, and if the
  // package is what we want to test, generate the compilation database for it. The generations are
  // parallelized and each test case just reports the result of it.
  const jobs = representatives.map(cppFile =>
    // Returns a job that is always fulfilled. The job returns undefined if we don't test compdb
    // generation for the cppFile. Otherwise it returns an object containing the package name and
    // the error on compdb generation if any.
    async (): Promise<GenerateCompdbJobResult> => {
      const packageInfo = await packages.fromFilepath(cppFile);
      if (packageInfo === null) {
        return undefined;
      }
      const qpn = getQualifiedPackageName(packageInfo.pkg);
      if (!PACKAGES_TO_TEST_COMPDB_GENERATION.includes(qpn)) {
        return undefined;
      }

      if (
        seenPackageInfo.find(
          pi =>
            pi.pkg.category === packageInfo.pkg.category &&
            pi.pkg.name === packageInfo.pkg.name &&
            pi.sourceDir === packageInfo.sourceDir
        )
      ) {
        return undefined;
      }
      seenPackageInfo.push(packageInfo);

      try {
        await compdbService.generate(board, packageInfo);
        return {packageName: qpn};
      } catch (e: unknown) {
        return {packageName: qpn, error: e as Error};
      }
    }
  );

  const nproc = os.cpus().length;

  // Lazily create job runner instance to ensure heavy computation happens inside `it`.
  let jobRunner:
    | testing.ThrottledJobRunner<GenerateCompdbJobResult>
    | undefined = undefined;

  for (const packageName of PACKAGES_TO_TEST_COMPDB_GENERATION) {
    const timeoutInMillis = 30 * 60 * 1000;

    it(
      `for ${packageName} can generate compilation database on ${board}`,
      async () => {
        if (!jobRunner) {
          jobRunner = new testing.ThrottledJobRunner(jobs, nproc);
        }

        const settledResults = await jobRunner.allSettled();

        const results: (Error | undefined)[] = settledResults
          .map((r, i) => {
            if (r.status === 'rejected') {
              fail(`Job ${i} unexpectedly rejected: ${r.reason}`);
              return undefined;
            }
            return r.value;
          })
          .filter(r => r?.packageName === packageName)
          .map(r => r!.error);

        expect(results.length).toBeGreaterThan(0);

        for (const result of results) {
          if (result instanceof Error) {
            fail(result);
          }
        }
      },
      timeoutInMillis
    );
  }
});

/**
 * Rather than listing up all the C++ files, list up all the directories
 * containing a C++ file, and pick one C++ file from each such a directory.
 */
function* listCppFileRepresentatives(
  dir: string,
  dirsToIgnore: string[]
): Generator<string> {
  if (dirsToIgnore.includes(dir)) return;

  let cppFileChosen = false;

  for (const name of fs.readdirSync(dir)) {
    const file = path.join(dir, name);
    const stat = fs.lstatSync(file);

    if (stat.isSymbolicLink()) {
      continue;
    }
    if (stat.isDirectory()) {
      yield* listCppFileRepresentatives(file, dirsToIgnore);
      continue;
    }
    if (!cppFileChosen && ['.c', '.cc', '.cpp'].includes(path.extname(file))) {
      yield file;
      cppFileChosen = true;
    }
  }
}
