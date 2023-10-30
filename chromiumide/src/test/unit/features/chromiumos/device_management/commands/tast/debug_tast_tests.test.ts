// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  DebugTastTestsResult,
  debugTastTests,
} from '../../../../../../../features/device_management/commands/tast/debug_tast_tests';
import {ChrootService} from '../../../../../../../services/chromiumos';
import * as testing from '../../../../../../testing';
import {prepareCommonFakes} from './common';

describe('debugTastTests', () => {
  const {vscodeSpy, vscodeEmitters, vscodeGetters} =
    testing.installVscodeDouble();
  testing.installFakeConfigs(vscodeSpy, vscodeEmitters);

  const {fakeExec} = testing.installFakeExec();

  const tempDir = testing.tempDir();

  const subscriptions: vscode.Disposable[] = [];
  afterEach(() => {
    vscode.Disposable.from(...subscriptions.splice(0).reverse()).dispose();
  });

  it('debugs Tast tests on device (host dlv exists)', async () => {
    const homedir = tempDir.path;
    const chromiumos = path.join(homedir, 'chromiumos');
    await fs.promises.mkdir(chromiumos);

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
        testsToPick: ['example.ChromeFixture'],
      },
      subscriptions
    );

    // Prepare dlv command responses.
    const dlv = path.join(homedir, '.cache/chromiumide/go/bin/dlv');
    await testing.putFiles('/', {[dlv]: ''});
    fakeExec.installStdout(
      dlv,
      ['version'],
      `Delve Debugger
Version: 1.21.0
Build: $Id: fec0d226b2c2cce1567d5f59169660cf61dc1efe $
`
    );

    // Prepare Go extension settings.
    vscodeSpy.workspace.getConfiguration
      .withArgs('go')
      .and.returnValue(
        testing.fakes.FakeWorkspaceConfiguration.fromDefaults(
          'go',
          new Map([['alternateTools', {}]]),
          subscriptions
        )
      );

    // Test.
    const result = await debugTastTests(
      context,
      ChrootService.maybeCreate(chromiumos, /* setContext = */ false)!,
      homedir
    );

    expect(result).toEqual(new DebugTastTestsResult());
  });
});
