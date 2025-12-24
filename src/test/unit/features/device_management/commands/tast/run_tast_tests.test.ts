// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as commonUtil from '../../../../../../../shared/app/common/common_util';
import {CancelledError} from '../../../../../../../shared/app/common/exec/types';
import {
  TestResult,
  runTastTests,
} from '../../../../../../features/device_management/commands/tast/run_tast_tests';
import {TEST_ONLY} from '../../../../../../features/device_management/commands/tast/tast_common';
import {ChrootService} from '../../../../../../services/chromiumos';
import * as testing from '../../../../../testing';
import {installChrootCommandHandler} from '../../../../../testing/fakes';
import {arrayWithPrefix} from '../../../../testing/jasmine/asymmetric_matcher';
import {prepareCommonFakes} from '../common';

describe('runTastTests', () => {
  const {vscodeSpy, vscodeEmitters, vscodeGetters} =
    testing.installVscodeDouble();
  testing.installFakeConfigs(vscodeSpy, vscodeEmitters);

  const fakeExec = testing.installFakeExec();

  const tempDir = testing.tempDir();

  const subscriptions: vscode.Disposable[] = [];
  afterEach(() => {
    vscode.Disposable.from(...subscriptions.splice(0).reverse()).dispose();
  });

  it('runs Tast tests on device', async () => {
    // Prepare a fake chromeos.
    const chromiumos = tempDir.path;

    const context = await prepareCommonFakes(
      fakeExec,
      vscodeGetters,
      vscodeSpy,
      {
        chromiumos,
        tastTestConfig: {
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
          // No tests to pick. If there is only one runnable test, it will be run automatically.
          testsToPick: [],
        },
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
    installChrootCommandHandler(
      fakeExec,
      chromiumos,
      'cat',
      ['/tmp/tast/results/latest/results.json'],
      async () => `[
    {
        "name": "example.ChromeFixture",
        "errors": null,
        "skipReason": ""
    }
]
`
    );

    // Test.
    const result = await runTastTests(
      context,
      ChrootService.maybeCreate(chromiumos, /* setContext = */ false)!
    );

    expect(result).toEqual({
      status: 'run',
      results: [
        {
          result: 'passed',
          name: 'example.ChromeFixture',
          errors: null,
          skipReason: '',
        },
      ],
    });

    expect(vscodeSpy.window.showInformationMessage).toHaveBeenCalledOnceWith(
      'All 1 test(s) passed',
      jasmine.anything()
    );

    expect(vscodeSpy.window.showQuickPick).not.toHaveBeenCalledWith(
      jasmine.objectContaining({title: TEST_ONLY.SELECT_TEST_TITLE})
    );
  });

  it('notifies results to the user', async () => {
    // Prepare a fake chromeos.
    const chromiumos = tempDir.path;

    const context = await prepareCommonFakes(
      fakeExec,
      vscodeGetters,
      vscodeSpy,
      {
        chromiumos,
        tastTestConfig: {
          activeTextEditor: {
            path: 'src/platform/tast-tests/src/go.chromium.org/tast-tests/cros/local/bundles/cros/fake/x.go',
            text: `func init() {
  testing.AddTest(&testing.Test{
    Func: X,
    Params: []testing.Params{{
      Name: "pass",
    },{
      Name: "fail",
    },{
      Name: "skip",
    }}
  })
}

func X(ctx context.Context, s *testing.State) {}
`,
          },
          tastListResult: `fake.X.pass
fake.X.fail
fake.X.skip
`,
          testsToPick: ['fake.X.pass', 'fake.X.fail', 'fake.X.skip'],
        },
      },
      subscriptions
    );

    let tastRun: (
      args: string[]
    ) => Awaited<ReturnType<typeof commonUtil.exec>> = () =>
      new Error('failed');
    let catResultsJson: Awaited<ReturnType<typeof commonUtil.exec>> = new Error(
      'not found'
    );

    // Prepare external command responses.
    installChrootCommandHandler(
      fakeExec,
      chromiumos,
      'tast',
      arrayWithPrefix('run'),
      async args => {
        expect(args.slice(args.length - 3)).toEqual(
          jasmine.arrayWithExactContents([
            'fake.X.pass',
            'fake.X.fail',
            'fake.X.skip',
          ])
        );
        return tastRun(args);
      }
    );
    installChrootCommandHandler(
      fakeExec,
      chromiumos,
      'cat',
      ['/tmp/tast/results/latest/results.json'],
      async () => catResultsJson
    );

    const chrootService = ChrootService.maybeCreate(
      chromiumos,
      /* setContext = */ false
    )!;

    {
      // Tast run command fails.
      const result = await runTastTests(context, chrootService);
      expect(vscodeSpy.window.showErrorMessage).toHaveBeenCalledWith(
        'Command failed: failed',
        jasmine.anything()
      );
      expect(result).toEqual({
        status: 'error',
        error: jasmine.objectContaining({message: 'failed'}),
      });
    }

    // Make tast run succeed.
    tastRun = () => ({
      exitStatus: 0,
      stdout: '',
      stderr: '',
    });

    {
      // Cat command fails.
      const result = await runTastTests(context, chrootService);
      expect(vscodeSpy.window.showErrorMessage).toHaveBeenCalledWith(
        'Tests finished but reading results failed: ' + catResultsJson.message,
        jasmine.anything()
      );
      expect(result).toEqual({
        status: 'run',
        results: jasmine.objectContaining({message: 'not found'}),
      });
    }

    // Make cat results.json succeed.
    const testResults: TestResult[] = [
      {
        name: 'X.pass',
        errors: null,
        skipReason: '',
      },
      {
        name: 'X.fail',
        errors: [
          {
            reason: 'r',
          },
        ],
        skipReason: '',
      },
      {
        name: 'X.skip',
        errors: null,
        skipReason: 's',
      },
    ];
    catResultsJson = {
      exitStatus: 0,
      stdout: JSON.stringify(testResults),
      stderr: '',
    };

    {
      const result = await runTastTests(context, chrootService);
      expect(vscodeSpy.window.showErrorMessage).toHaveBeenCalledWith(
        '1 / 2 test(s) failed (1 skipped)',
        jasmine.anything()
      );

      const wantResults = ['passed', 'failed', 'skipped'] as const;
      expect(result).toEqual({
        status: 'run',
        results: testResults.map((r, i) => ({...r, result: wantResults[i]})),
      });
    }

    // Make tast run command cancelled.
    tastRun = args => new CancelledError('tast', args);

    {
      const result = await runTastTests(context, chrootService);
      expect(vscodeSpy.window.showErrorMessage).toHaveBeenCalledWith(
        'Cancelled running tests.',
        jasmine.anything()
      );
      expect(result).toEqual({
        status: 'cancel',
      });
    }
  });
});
