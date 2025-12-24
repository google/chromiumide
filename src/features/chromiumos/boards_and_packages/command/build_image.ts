// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {AssertTrue, Equal} from '../../../../../shared/app/common/typecheck';

/**
 * Runs `cros build-image --board $BOARD` on terminal.
 */
export async function buildImage(board: string): Promise<void> {
  const items = imageTypes.map(
    x =>
      ({
        label: x,
        detail: imageTypeDescriptions[x],
      } as vscode.QuickPickItem)
  );

  const choice = await vscode.window.showQuickPick(items, {
    title: 'Select the image type to build',
  });
  if (!choice) return;

  const terminal = vscode.window.createTerminal(
    `Build ${board} image (${choice.label})`
  );

  // Don't exec the command to allow the user to examine error messages if any.
  terminal.sendText(`cros build-image --board ${board} ${choice.label}`);
  terminal.show();

  const listener = vscode.window.onDidCloseTerminal(closedTerminal => {
    if (terminal !== closedTerminal) return;
    terminal.dispose();
    listener.dispose();
  });
}

// Descriptions copied from chromite/cli/cros/cros_build_image.py
const imageTypeDescriptions = {
  test: 'Like dev, but with additional test specific packages and can be easily used for automated testing using scripts like test_that, etc.',
  dev: 'Developer image. Like base but with additional dev packages.',
  base: 'Pristine ChromiumOS image. As similar to ChromeOS as possible.',
  factory_install:
    'Install shim for bootstrapping the factory test process. Cannot be built along with any other image.',
  flexor:
    'Builds a standalone Flexor vmlinuz. Flexor is a ChromeOS Flex installer for more details, take a look at platform2/flexor or go/dd-flexor.',
} as const;

const imageTypes = [
  // Show the popular option first.
  'test',
  // Show the default option next.
  'dev',
  // Rest are ordered as those in the cros_build_image.py description.
  'base',
  'factory_install',
  'flexor',
] as const;

type _ = AssertTrue<
  Equal<keyof typeof imageTypeDescriptions, typeof imageTypes[number]>
>;
