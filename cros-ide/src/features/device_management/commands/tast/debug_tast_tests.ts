// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as services from '../../../../services';
import {CommandContext} from '../common';
import {
  askTestNames,
  preTestSetUp,
  showPromptWithOpenLogChoice,
} from './tast_common';

/**
 * Represents the result of the call to debugTastTests.
 */
export class DebugTastTestsResult {
  constructor() {}
}

/**
 * Prompts a user for tast tests to debug, and runs the selected tests
 * under debugger. Returns null when the tests aren't run.
 * @param context The current command context.
 * @param chrootService The chroot to run commands in.
 */
export async function debugTastTests(
  context: CommandContext,
  chrootService: services.chromiumos.ChrootService
): Promise<DebugTastTestsResult | null | Error> {
  // TODO(uchiaki): Send metrics. See what runTastTests does for reference.

  const preTestResult = await preTestSetUp(context);
  if (!preTestResult) {
    return null;
  }
  const {hostname, testCase, port} = preTestResult;

  const target = `localhost:${port}`;

  // TODO(uchiaki): Ensure the target DUT has delve installed.
  // http://go/debug-tast-tests#step-1_confirm-that-your-dut-can-run-delve
  // 1. Check if the target has the dlv binary.
  // 2. If not, build delve inside chroot and deploy it. We can use
  //    `getOrSelectTargetBoard` in `src/ide_util.ts` for getting the `BOARD`
  //    value on the initial implementation.

  // TODO(uchiaki): Ensure the host has delve installed.
  // http://go/debug-tast-tests#step-2_install-the-debugger-on-your-host-machine-outside-the-chroot

  const testNames = await askTestNames(
    context,
    chrootService,
    hostname,
    target,
    testCase
  );
  if (!testNames) {
    return null;
  }

  try {
    await debugSelectedTests(context, chrootService, target, testNames);
    showPromptWithOpenLogChoice(context, 'Tests run successfully.', false);
    return new DebugTastTestsResult();
  } catch (err) {
    showPromptWithOpenLogChoice(context, 'Failed to run tests.', true);
    throw err;
  }
}

/**
 * Debug all of the selected tests.
 * @param context The current command context.
 * @param chrootService The chroot to run commands in.
 * @param target The target to run the `tast run` command on.
 * @param testNames The names of the tests to run.
 */
async function debugSelectedTests(
  _context: CommandContext,
  _chrootService: services.chromiumos.ChrootService,
  _target: string,
  _testNames: string[]
): Promise<void | Error> {
  // TODO(uchiaki): Debug the selected tests. TODO(oka): Elaborate more about
  // it.
}
