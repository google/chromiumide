// Copyright 2022 The ChromiumOS Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import type * as vscode from 'vscode';
import * as commander from 'commander';
import * as commonUtil from '../../../common/common_util';

export function installCommand(program: commander.Command) {
  program
    .command('clangd')
    .description(
      'receives C++ files from stdin and outputs errors from clangd run against the files'
    )
    .action(main);
}

async function main() {
  const cppFiles = (await fs.promises.readFile('/dev/stdin', 'utf8')).split(
    '\n'
  );
  for (const cppFile of cppFiles) {
    const result = await check(cppFile);
    for (const header of result.notFoundHeaders) {
      console.log(`pp_file_not_found ${cppFile} ${header}`);
    }
  }
}

type CheckResult = {
  notFoundHeaders: string[];
};

export async function check(
  cppFile: string,
  output?: vscode.OutputChannel
): Promise<CheckResult> {
  const result = await commonUtil.exec(
    'clangd',
    [`--check=${cppFile}`, '--log=error'],
    {
      logger: output,
      ignoreNonZeroExit: true,
    }
  );
  if (result instanceof Error) {
    throw result;
  }
  const notFoundHeaders = [];
  // Example:
  // E[08:35:00.944] [pp_file_not_found] Line 41: 'foo.h' file not found
  const fileNotFoundRegexp = /^E\S+\s+\[pp_file_not_found\].*:\s*'(.*)'.*$/gm;
  let match;
  while ((match = fileNotFoundRegexp.exec(result.stderr)) !== null) {
    const header = match[1];
    notFoundHeaders.push(header);
  }
  return {notFoundHeaders};
}
