// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as assert from 'assert';
import * as vscode from 'vscode';

import * as ide_utilities from '../../ide_utilities'

suite('Extension Test Suite', () => {
  vscode.window.showInformationMessage('Start all tests.');

  test('execFile', async () => {
    const result = await ide_utilities.execFile('/bin/echo', ['hoge']);
    assert.strictEqual('', result.stderr);
    assert.strictEqual('hoge\n', result.stdout);
  });
});
