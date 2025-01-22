// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import path from 'path';
import * as vscode from 'vscode';
import * as config from '../../../../shared/app/services/config';
import {
  StatusManager,
  TaskStatus,
} from '../../../../shared/app/ui/bg_task_status';
import {registerCommands} from './commands';
import {checkConflictingExtensions} from './conflicts';
import {activateDebugger} from './debugger';
import {JniZeroCodeLensProvider} from './jni_zero';
import {LanguageServerManager} from './language';
import {StatusBar} from './ui';

export function activate(
  context: vscode.ExtensionContext,
  chromiumDir: string,
  statusManager: StatusManager
): void {
  const output = vscode.window.createOutputChannel(
    'ChromiumIDE: Chromium Java support'
  );

  // Register the output channel to the IDE status view.
  statusManager.setTask('Chromium Java support', {
    status: TaskStatus.OK,
    outputChannel: output,
  });

  const statusBar = new StatusBar();
  const srcDir = path.join(chromiumDir, 'src');

  const manager = new LanguageServerManager(
    context.extensionPath,
    srcDir,
    output,
    statusBar
  );
  context.subscriptions.push(manager);

  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      {
        language: 'java',
      },
      new JniZeroCodeLensProvider()
    )
  );

  if (config.underDevelopment.chromiumJavaDebugger.get()) {
    activateDebugger(context, srcDir, manager, output);
  }

  registerCommands(context, srcDir, output);

  checkConflictingExtensions();
}
