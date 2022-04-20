// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as assert from 'assert';
import 'jasmine';
import * as util from 'util';
import * as vscode from 'vscode';
import {CompdbService} from '../../../features/cpp_code_completion/compdb_service';
import {CompilationDatabase} from '../../../features/cpp_code_completion/cpp_code_completion';
import {
  PackageInfo,
  Packages,
} from '../../../features/cpp_code_completion/packages';
import * as bgTaskStatus from '../../../ui/bg_task_status';
import {installVscodeDouble} from '../doubles';
import {FakeOutputChannel} from '../fakes/output_channel';
import {fakeGetConfiguration} from '../fakes/workspace_configuration';

class SpiedCompdbService implements CompdbService {
  readonly requests: Array<{board: string; packageInfo: PackageInfo}> = [];

  async generate(board: string, packageInfo: PackageInfo) {
    this.requests.push({board, packageInfo});
  }
  isEnabled(): boolean {
    return true;
  }
}

describe('C++ code completion', () => {
  const {vscodeSpy, vscodeEmitters} = installVscodeDouble();

  it('runs for platform2 C++ file', async () => {
    const spiedService = new SpiedCompdbService();
    const compilationDatabase = new CompilationDatabase(
      new bgTaskStatus.TEST_ONLY.StatusManagerImpl(),
      new Packages(),
      new FakeOutputChannel(),
      spiedService
    );

    vscodeSpy.workspace.getConfiguration.and.callFake(fakeGetConfiguration());
    vscode.workspace
      .getConfiguration('cros-ide')
      .update('board', 'amd64-generic');

    vscodeEmitters.window.onDidChangeActiveTextEditor.fire({
      document: {
        fileName: '/mnt/host/source/src/platform2/cros-disks/foo.cc',
        languageId: 'cpp',
      },
    } as vscode.TextEditor);

    await util.promisify(setTimeout)(0); // tick

    compilationDatabase.dispose();

    assert.deepStrictEqual(spiedService.requests, [
      {
        board: 'amd64-generic',
        packageInfo: {
          sourceDir: 'src/platform2/cros-disks',
          atom: 'chromeos-base/cros-disks',
        },
      },
    ]);
  });

  // TODO(oka): Add more tests.
  // 1. BUILD.gn file is saved -> compdb should be generated
  // 2. C++ file is saved -> compdb should not be generated
  // 3. C++ file is opened but for the package for which compdb has been
  //    generated in this session -> compdb should not be generated
});
