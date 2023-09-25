// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as commonUtil from '../../../../../../../common/common_util';
import {
  RunTastTestsResult,
  runTastTests,
} from '../../../../../../../features/device_management/commands/tast/run_tast_tests';
import {ChrootService} from '../../../../../../../services/chromiumos';
import * as testing from '../../../../../../testing';
import {installChrootCommandHandler} from '../../../../../../testing/fakes';
import {arrayWithPrefix} from '../../../../../testing/jasmine/asymmetric_matcher';
import {prepareCommonFakes} from './common';

describe('runTastTests', () => {
  const {vscodeSpy, vscodeEmitters, vscodeGetters} =
    testing.installVscodeDouble();
  testing.installFakeConfigs(vscodeSpy, vscodeEmitters);

  const {fakeExec} = testing.installFakeExec();

  const tempDir = testing.tempDir();

  const subscriptions: vscode.Disposable[] = [];
  afterEach(() => {
    vscode.Disposable.from(...subscriptions.splice(0).reverse()).dispose();
  });

  it('runs Tast tests on device', async () => {
    // Prepare a fake chroot.
    const chromiumos = tempDir.path as commonUtil.Source;

    const context = await prepareCommonFakes(
      fakeExec,
      vscodeGetters,
      vscodeSpy,
      {
        chromiumos,
        activeTextEditor: {
          path: 'src/platform/tast-tests/src/go.chromium.org/tast-tests/cros/local/bundles/cros/example/chrome_fixture.go',
          text: `func init() {
  testing.AddTest(&testing.Test{
    Func: ChromeFixture,
  })
}

func ChromeFixture(ctx context.Context, s *testing.State) {}
`,
        },
        tastListResult: 'example.ChromeFixture\n',
        testToPick: 'example.ChromeFixture',
      },
      subscriptions
    );

    // Prepare external command responses.
    installChrootCommandHandler(
      fakeExec,
      chromiumos,
      'tast',
      arrayWithPrefix('run'),
      async () => '' // OK
    );

    // Test.
    const result = await runTastTests(
      context,
      ChrootService.maybeCreate(chromiumos, /* setContext = */ false)!
    );

    expect(result).toEqual(new RunTastTestsResult());
  });
});
