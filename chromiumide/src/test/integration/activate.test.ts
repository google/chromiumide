// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import assert from 'assert';
import * as vscode from 'vscode';

describe('ChromiumIDE', () => {
  /**
   * The test will fail if activating the extension is not possible,
   * for example, if the main function, extension.activate(), throws an Error.
   */
  // TODO(b:230425191): This test is flaky. Fix flakiness and enable it again.
  xit('activates without errors', async () => {
    const ext = vscode.extensions.getExtension('google.cros-ide');
    assert.ok(ext);
    await ext.activate();
  });
});
