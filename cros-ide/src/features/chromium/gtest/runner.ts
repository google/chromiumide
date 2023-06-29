// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import * as commonUtil from '../../../common/common_util';
import * as config from '../../../services/config';
import {AbstractRunner} from '../../gtest/abstract_runner';
import {GtestCase} from '../../gtest/gtest_case';
import * as gtestTestListParser from '../../gtest/gtest_test_list_parser';
import {GtestWorkspace} from '../../gtest/gtest_workspace';
import * as metrics from '../../metrics/metrics';
import * as outputDirectories from '../output_directories';
import * as testLauncherSummaryParser from './test_launcher_summary_parser';

/**
 * Runs gtest cases according to the given request.
 *
 * TODO(cmfcmf): Also support debugging tests.
 */
export class Runner extends AbstractRunner {
  constructor(
    private readonly srcPath: string,
    private readonly controller: vscode.TestController,
    request: vscode.TestRunRequest,
    cancellation: vscode.CancellationToken,
    gtestWorkspace: GtestWorkspace
  ) {
    const testRun = controller.createTestRun(request);
    super(request, cancellation, testRun, gtestWorkspace);
  }

  /**
   * Given a request from the user, find all the matching test cases that should run.
   *
   * TODO(cmfcmf): Ideally, we should also support the user wanting to run/not run parametrized sub
   * tests.
   */
  private async getTestCasesToRun() {
    const testCases: GtestCase[] = [];
    await this.gtestWorkspace.forEachMatching(this.request, async testCase => {
      testCases.push(testCase);
    });

    return testCases;
  }

  /**
   * Given `testCases`, return a set of files paths in which these test cases are defined.
   */
  private getTestFilesToRun(testCases: GtestCase[]): vscode.Uri[] {
    const testFiles = new Set<vscode.Uri>();
    testCases.forEach(testCase => {
      testFiles.add(testCase.uri);
    });
    return Array.from(testFiles);
  }

  /**
   * Given a list of file paths, return a list of the names of test targets that need to be run to
   * run tests in these files. If all files are part of the same test target, then this method will
   * just return a single test target name.
   */
  private async getTestTargetNames(
    testFiles: vscode.Uri[]
  ): Promise<string[] | Error> {
    const result = await commonUtil.exec(
      // TODO(cmfcmf): Support Windows
      // TODO(cmfcmf): We should probably specify the full path to depot tools here(?)
      'gn',
      [
        'refs',
        outputDirectories.CURRENT_LINK_NAME,
        '--as=output',
        '--all',
        '--testonly=true',
        '--type=executable',
        ...testFiles.map(testFile =>
          path.relative(this.srcPath, testFile.fsPath)
        ),
      ],
      {
        cancellationToken: this.cancellation,
        cwd: this.srcPath,
        logger: this.output,
        logStdout: true,
      }
    );
    if (result instanceof Error) {
      return result;
    }
    return result.stdout
      .trim()
      .split('\n')
      .map(testTargetName => testTargetName.trim());
  }

  /**
   * Builds the given test targets using autoninja.
   */
  private async buildTestTargets(
    testTargetNames: string[]
  ): Promise<Error | void> {
    const result = await commonUtil.exec(
      // TODO(cmfcmf): Support Windows
      // TODO(cmfcmf): We should probably specify the full path to depot tools here(?)
      'autoninja',
      ['-C', outputDirectories.CURRENT_LINK_NAME, ...testTargetNames],
      {
        cancellationToken: this.cancellation,
        cwd: this.srcPath,
        logger: this.output,
        logStdout: true,
        env: {
          ...process.env,
          // Force ninja to use colored output for things like error messages.
          // https://github.com/ninja-build/ninja/issues/2196#issuecomment-1262923451
          // https://github.com/ninja-build/ninja/blob/36843d387cb0621c1a288179af223d4f1410be73/src/line_printer.cc#L60-L63
          CLICOLOR_FORCE: '1',
        },
      }
    );
    if (result instanceof Error) {
      return result;
    }
  }

  /**
   * Given a built test target, extracts a set of test names contained in the target. Note that
   * these names will *not* include test parameters. E.g., a test named `All/FooTest.Bar/0` will be
   * returned as `FooTest.Bar`.
   *
   * TODO(cmfcmf): We should probably support parametrized test names here.
   */
  private async extractAllTestNamesFromTestTarget(
    testTargetName: string
  ): Promise<Set<string> | Error> {
    const result = await commonUtil.exec(
      path.join(
        this.srcPath,
        outputDirectories.CURRENT_LINK_NAME,
        testTargetName
      ),
      ['--gtest_list_tests'],
      {
        cancellationToken: this.cancellation,
        cwd: this.srcPath,
        logger: this.output,
      }
    );
    if (result instanceof Error) {
      return result;
    }
    return new Set(gtestTestListParser.parse(result.stdout));
  }

  /**
   * Given the name of a test target, as well as a list of test cases, run the specified tests in
   * that target.
   */
  private async runTestCasesInTarget(
    testTargetName: string,
    testCasesInTarget: GtestCase[],
    resultOutputPath: string
  ): Promise<void | Error> {
    // TODO(cmfcmf): Most (all?) test targets have an accompanying wrapper script in
    // out/bin/run_<target>. They seem to be related to Android development. Understand what these
    // wrapper scripts are and when they are useful. One downside appears to be that they always
    // suppress gtest's output colors, even when specifying `--gtest_color=yes`.
    //
    // const bin_path = path.join(
    //   this.srcPath,
    //   output_directories.CURRENT_LINK_NAME,
    //   'bin',
    //   // TODO(cmfcmf): Support Windows
    //   `run_${testTargetName}`
    // );
    // if (fs.existsSync(bin_path)) {
    //   return await common_util.exec(bin_path, args, options);
    // }

    const args = [
      `--gtest_filter=${testCasesInTarget
        .map(testCase => testCase.getGtestFilter())
        .join(':')}`,
      '--gtest_color=yes',
      `--test-launcher-summary-output=${resultOutputPath}`,
      // TODO(cmfcmf): Understand what this flag does and when it is needed. It appears to be
      // specific to Android tests.
      // '--fast-local-dev',
    ];

    if (config.chrome.gtest.botMode.get() && testCasesInTarget.length > 1) {
      args.push('--test-launcher-bot-mode');
    }

    const result = await commonUtil.exec(
      'testing/xvfb.py',
      [path.join(outputDirectories.CURRENT_LINK_NAME, testTargetName), ...args],
      {
        cancellationToken: this.cancellation,
        cwd: this.srcPath,
        logger: this.output,
        logStdout: true,
        ignoreNonZeroExit: true,
      }
    );
    if (result instanceof Error) {
      return result;
    }
  }

  protected override async doRun() {
    const testCases = await this.getTestCasesToRun();
    if (this.cancellation.isCancellationRequested) {
      return;
    }
    if (testCases.length === 0) {
      this.output.appendLine('No tests found to run.');
      metrics.send({
        category: 'error',
        group: 'chromium.gtest',
        name: 'chromium_gtest_no_test_cases_found',
        description: 'Found no test cases to run',
      });
      return;
    }
    testCases.forEach(testCase => this.testRun.enqueued(testCase.item));

    const tempDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'chromium-ide-test-run')
    );
    this.output.appendLine(`Using ${tempDir} as temporary directory.`);
    if (this.cancellation.isCancellationRequested) {
      return;
    }

    const testFiles = this.getTestFilesToRun(testCases);
    const testTargetNames = await this.getTestTargetNames(testFiles);
    if (testTargetNames instanceof Error) {
      this.output.appendLine(
        `Error calculating test targets from test files: ${testTargetNames}`
      );
      if (!(testTargetNames instanceof commonUtil.CancelledError)) {
        metrics.send({
          category: 'error',
          group: 'chromium.gtest',
          name: 'chromium_gtest_calculate_test_targets_failed',
          description: 'Failed to calculate test targets based on test files',
        });
      }
      return;
    }

    metrics.send({
      category: 'interactive',
      group: 'debugging',
      name: 'debugging_run_gtest',
      description: 'run chromium gtests',
      package_names: testTargetNames.join(' '),
      tests_count: testCases.length,
    });

    const result = await this.buildTestTargets(testTargetNames);
    if (result instanceof Error) {
      this.output.appendLine(
        `Error while building test targets (${testTargetNames}): ${result}`
      );
      if (!(result instanceof commonUtil.CancelledError)) {
        metrics.send({
          category: 'error',
          group: 'chromium.gtest',
          name: 'chromium_gtest_build_test_targets_failed',
          description: 'Failed to build test targets',
        });
      }
      return;
    }

    for (const testTargetName of testTargetNames) {
      const allTestNamesInTarget = await this.extractAllTestNamesFromTestTarget(
        testTargetName
      );
      if (allTestNamesInTarget instanceof Error) {
        this.output.appendLine(
          `Error while extracting tests of test target ${testTargetName}: ${allTestNamesInTarget}`
        );
        if (!(allTestNamesInTarget instanceof commonUtil.CancelledError)) {
          metrics.send({
            category: 'error',
            group: 'chromium.gtest',
            name: 'chromium_gtest_extract_tests_from_target',
            description: 'Failed to extract list of tests from test target',
          });
        }
        return;
      }

      const testCasesInTarget = testCases.filter(testCase =>
        allTestNamesInTarget.has(testCase.testName)
      );
      if (testCasesInTarget.length === 0) {
        this.output.appendLine(
          `Expected to find at least one test case in target ${testTargetName}.`
        );
        metrics.send({
          category: 'error',
          group: 'chromium.gtest',
          name: 'chromium_gtest_test_target_has_no_matching_test_cases',
          description:
            'A test target unexpectedly does not have any matching test cases',
        });
        return;
      }
      const result = await this.runTestsInTestTarget(
        testCasesInTarget,
        testTargetName,
        tempDir
      );
      if (result instanceof Error) {
        this.output.appendLine(
          `Error while running ${testCasesInTarget.length} test cases in target ${testTargetName}: ${result}`
        );
        return;
      }
    }
  }

  private async runTestsInTestTarget(
    testCases: GtestCase[],
    testTargetName: string,
    tempDir: string
  ): Promise<void | Error> {
    testCases.forEach(testCase => this.testRun.started(testCase.item));

    const resultOutputPath = path.join(
      tempDir,
      testTargetName + '_summary.json'
    );
    const result = await this.runTestCasesInTarget(
      testTargetName,
      testCases,
      resultOutputPath
    );
    if (result instanceof Error) {
      if (!(result instanceof commonUtil.CancelledError)) {
        metrics.send({
          category: 'error',
          group: 'chromium.gtest',
          name: 'chromium_gtest_test_run_failed',
          description: 'Running a test target failed',
        });
      }
      return new Error(`Failed to run test cases : ${result}`);
    }

    const testResults = testLauncherSummaryParser.parseTestLauncherSummary(
      vscode.Uri.file(
        path.join(this.srcPath, outputDirectories.CURRENT_LINK_NAME)
      ),
      await fs.promises.readFile(resultOutputPath, 'utf-8')
    );
    if (testResults instanceof Error) {
      metrics.send({
        category: 'error',
        group: 'chromium.gtest',
        name: 'chromium_gtest_parse_test_results_failed',
        description: 'Parsing test results from test launcher summary failed',
      });
      return new Error(
        `Failed to parse test result summary "${resultOutputPath}": ${testResults}`
      );
    }

    for (const [
      possiblyParametrizedTestName,
      testResult,
    ] of testResults.entries()) {
      const error = this.processTestResult(
        testCases,
        possiblyParametrizedTestName,
        testResult
      );
      if (error instanceof Error) {
        this.output.appendLine(error.toString());
        // We don't `return` here, since a single test result missing is not a critical error.
      }
    }
  }

  private processTestResult(
    testCases: GtestCase[],
    possibleParametrizedTestName: string,
    testResult: testLauncherSummaryParser.TestSummaryResult
  ): Error | void {
    const item = this.getOrCreateTestItemForTestResult(
      testCases,
      possibleParametrizedTestName
    );
    if (item instanceof Error) {
      return new Error(
        `Unable to get or create vscode.TestItem for test result (${possibleParametrizedTestName}): ${item}`
      );
    }
    switch (testResult.status) {
      case 'NOTRUN':
      case 'UNKNOWN':
      case 'SKIPPED':
        this.testRun.skipped(item);
        break;
      case 'SUCCESS':
        this.testRun.passed(item, testResult.duration);
        break;
      case 'FAILURE':
      case 'FAILURE_ON_EXIT':
      case 'CRASH':
      case 'TIMEOUT':
      case 'EXCESSIVE_OUTPUT':
        this.testRun.failed(
          item,
          [
            ...testResult.errors,
            new vscode.TestMessage(`Test status: ${testResult.status}`),
          ],
          testResult.duration
        );
        break;
      default:
        return new Error(`Unexpected test result status: ${testResult.status}`);
    }
  }

  private getOrCreateTestItemForTestResult(
    testCases: GtestCase[],
    possibleParametrizedTestName: string
  ): Error | vscode.TestItem {
    {
      const item = testCases.find(
        testCase => testCase.testName === possibleParametrizedTestName
      )?.item;
      if (item) {
        return item;
      }
    }

    // TODO(cmfcmf): This code should be generalized to also work with the ChromiumOS test runner.
    let instantiationName: string | null;
    let testName: string;
    let subTestName: string;

    const parts = possibleParametrizedTestName.split('/');
    if (parts.length === 3) {
      instantiationName = parts[0]!;
      testName = parts[1]!;
      subTestName = parts[2]!;
    } else if (parts.length === 2) {
      instantiationName = null;
      testName = parts[0]!;
      subTestName = parts[1]!;
    } else {
      return new Error(
        `Unable to parse possibly parametrized test name ("${possibleParametrizedTestName}")`
      );
    }

    const item = testCases.find(
      testCase => testCase.testName === testName
    )?.item;
    if (!item) {
      metrics.send({
        category: 'error',
        group: 'chromium.gtest',
        name: 'chromium_gtest_test_item_for_test_result_failed',
        description: 'Getting/creating a test item for a test result failed',
      });

      return new Error(
        `Unable to find test case for test "${testName}" ("${possibleParametrizedTestName}"). Test cases: ${testCases
          .map(testCase => testCase.testName)
          .join(', ')}`
      );
    }

    let testItemOrInstantiationItem;
    if (instantiationName !== null) {
      const instantiationId = `${item.id}:instantiation:${instantiationName}`;
      let instantiationItem = item.children.get(instantiationId);
      if (!instantiationItem) {
        instantiationItem = this.controller.createTestItem(
          instantiationId,
          instantiationName,
          item.uri
        );
        instantiationItem.range = item.range;
        item.children.add(instantiationItem);
      }
      testItemOrInstantiationItem = instantiationItem;
    } else {
      testItemOrInstantiationItem = item;
    }

    const subTestId = `${testItemOrInstantiationItem.id}:subtest:${subTestName}`;
    let subTestItem = testItemOrInstantiationItem.children.get(subTestId);
    if (!subTestItem) {
      subTestItem = this.controller.createTestItem(
        subTestId,
        subTestName,
        testItemOrInstantiationItem.uri
      );
      subTestItem.range = testItemOrInstantiationItem.range;
      testItemOrInstantiationItem.children.add(subTestItem);
    }

    // Mark the sub test item as started.
    //
    // TODO(cmfcmf): Once we have proper support for parametrized tests, we will only need to start
    // the item if it was just created. However, for now, we'll have to always start the item since
    // currently only `GtestCase.item` (not its children) are marked as started by the rest of the
    // code.
    this.testRun.started(subTestItem);
    return subTestItem;
  }
}
