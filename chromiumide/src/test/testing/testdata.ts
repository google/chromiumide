// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {getExtensionUri} from './fs';

const testdataDir = path.join(getExtensionUri().fsPath, 'src/test/testdata');

export function testdataUri(pathFromTestdata: string): vscode.Uri {
  return vscode.Uri.file(path.join(testdataDir, pathFromTestdata));
}

/**
 * Reads the test data as a utf8 string.
 *
 * @param pathFromTestdata relative path from the testdata directory.
 */
export function testdataString(pathFromTestdata: string): string {
  return fs.readFileSync(testdataUri(pathFromTestdata).fsPath, 'utf8');
}
