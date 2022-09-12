// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import * as commonUtil from '../../../common/common_util';
import * as tricium from '../tricium';

/** Calls Tricium spellchecker for the input file and returns the result. */
export async function callSpellchecker(
  sourceRoot: string,
  inputPath: string,
  toolPath: string,
  outputChannel: vscode.OutputChannel
): Promise<tricium.Results | Error> {
  // Build a directory in Tricium input format
  const pathController = await TmpFs.create(sourceRoot, inputPath);

  const [inputDir, outputDir] = pathController.intputOutputDirs();
  const res = await commonUtil.exec(
    toolPath,
    [`--input=${inputDir}`, `--output=${outputDir}`],
    {
      logStdout: true,
      cwd: path.dirname(toolPath),
      logger: outputChannel,
    }
  );

  if (res instanceof Error) {
    await pathController.removeDirTree();
    return res;
  }

  const output = await pathController.readOutput();
  await pathController.removeDirTree();
  return JSON.parse(output);
}

/** Manages paths and files used to communicate with Tricium. */
class TmpFs {
  private constructor(
    private readonly tmpDir: string,
    private readonly triciumOutputDir: string
  ) {}

  static async create(
    sourceRoot: string,
    inputFilePath: string
  ): Promise<TmpFs> {
    // Create a temporary directory for communicating with the spellchecker.
    const tmpDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'tricium-')
    );

    // The spellchecker reads TMPDIR/tricium/data/files.json.
    const triciumInputFile = path.join(tmpDir, 'tricium', 'data', 'files.json');
    await fs.promises.mkdir(path.dirname(triciumInputFile), {
      recursive: true,
    });

    // Source files need to be relative to the TMPDIR, so we are creating
    // a symlink to real sources and use "fake" paths in files.json.
    await fs.promises.symlink(sourceRoot, path.join(tmpDir, 'source'));

    const fakePath = path.join(
      '/source',
      inputFilePath.substring(sourceRoot.length)
    );
    const filesJsonData = {
      files: [{path: fakePath}],
    };
    await fs.promises.writeFile(
      triciumInputFile,
      JSON.stringify(filesJsonData)
    );

    // The spellchecker will write its output to
    // TMPDIR/output/tricium/data/results.json.
    const triciumOutputDir = path.join(tmpDir, 'output');
    await fs.promises.mkdir(triciumOutputDir, {recursive: true});

    return new TmpFs(tmpDir, triciumOutputDir);
  }

  /** Returns paths needed when executing the spellchecker binary. */
  intputOutputDirs(): [string, string] {
    return [this.tmpDir, this.triciumOutputDir];
  }

  async readOutput() {
    const outputFile = path.join(
      this.triciumOutputDir,
      'tricium',
      'data',
      'results.json'
    );
    return await fs.promises.readFile(outputFile, {encoding: 'utf8'});
  }

  async removeDirTree() {
    await fs.promises.rm(this.tmpDir, {recursive: true});
  }
}
