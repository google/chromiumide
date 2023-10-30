// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import * as uuid from 'uuid';
import {BoardOrHost} from '../../../../common/chromiumos/board_or_host';
import {getQualifiedPackageName} from '../../../../common/chromiumos/portage/ebuild';
import * as services from '../../../../services';
import {PackageInfo} from '../../../../services/chromiumos';
import {checkCompilationDatabase} from './compdb_checker';
import {CompdbService} from './compdb_service';
import {CompilationDatabase} from './compilation_database_type';
import {Ebuild} from './ebuild';
import {CompdbError, CompdbErrorKind} from './error';
import {destination} from './util';

export class CompdbServiceImpl implements CompdbService {
  constructor(
    private readonly output: vscode.OutputChannel,
    private readonly crosFs: services.chromiumos.CrosFs
  ) {}

  async generate(board: BoardOrHost, packageInfo: PackageInfo): Promise<void> {
    // Add 'test' USE flag so that compdb includes test files.
    // This doesn't cause tests to be run, because we don't run the src_test phase.
    const compdbPath = await this.generateInner(board, packageInfo, [
      'compdb_only',
      'test',
    ]);
    if (!compdbPath) {
      return;
    }
    const content = JSON.parse(
      await fs.promises.readFile(compdbPath, 'utf-8')
    ) as CompilationDatabase;
    if (checkCompilationDatabase(content)) {
      return;
    }

    const qpn = getQualifiedPackageName(packageInfo.pkg);
    this.output.appendLine(
      `Running compilation for ${qpn} to create generated C++ files`
    );
    // Run compilation to generate C++ files (from mojom files, for example).
    await this.generateInner(board, packageInfo, [
      'compilation_database',
      'test',
    ]);
  }

  /**
   * Generates compilation database, and returns the filepath of compile_commands.json.
   *
   * @throws CompdbError on failure
   */
  async generateInner(
    board: BoardOrHost,
    {sourceDir, pkg}: PackageInfo,
    useFlags: string[]
  ): Promise<string | undefined> {
    const qpn = getQualifiedPackageName(pkg);
    const ebuild = new Ebuild(board, qpn, this.output, this.crosFs, useFlags);
    const artifact = await ebuild.generate();
    if (artifact === undefined) {
      throw new CompdbError({
        kind: CompdbErrorKind.NotGenerated,
      });
    }
    const dest = destination(this.crosFs.source.root, {
      sourceDir,
      pkg,
    });
    let tempFile;
    for (;;) {
      tempFile = path.join(path.dirname(dest), '.' + uuid.v4());
      if (!fs.existsSync(tempFile)) {
        break;
      }
    }
    try {
      const artifactPath = path.join(artifact.baseDir, artifact.path);
      this.output.appendLine(`Copying ${artifactPath} to ${tempFile}`);
      await fs.promises.copyFile(artifactPath, tempFile);
      this.output.appendLine(`Renaming ${tempFile} to ${dest}`);
      await fs.promises.rename(tempFile, dest);
    } catch (e) {
      throw new CompdbError({
        kind: CompdbErrorKind.CopyFailed,
        destination: dest,
        reason: e as Error,
      });
    } finally {
      await fs.promises.rm(tempFile, {force: true});
    }
    return dest;
  }
}
