// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {DemoRandomUuid} from './features/demo_random_uuid';

/**
 * Activates features shared between internal IDE and VSCode.
 */
export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(new DemoRandomUuid());
}
