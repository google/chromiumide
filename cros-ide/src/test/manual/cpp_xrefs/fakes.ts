// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as commonUtil from '../../../common/common_util';

export function installFakes() {
  vscode.window.showInputBox = cliShowInputBox;
}

async function cliShowInputBox(
  options?: vscode.InputBoxOptions,
  _token?: vscode.CancellationToken
): Promise<string | undefined> {
  if (!options?.password) {
    throw new Error('got password = false unexpectedly');
  }
  process.stderr.write(options.prompt + '\n');

  const PROGRAM = `#!/usr/bin/env python3

import getpass, sys

sys.stdout.write(getpass.getpass())
`;
  const tempdir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cros-ide'));
  const filepath = path.join(tempdir, 'askpass.py');
  await fs.promises.writeFile(filepath, PROGRAM);
  await fs.promises.chmod(filepath, '0755');

  const result = await commonUtil.exec(filepath, []);
  await fs.promises.rmdir(tempdir, {recursive: true});
  if (result instanceof Error) {
    throw result;
  }
  return result.stdout;
}
