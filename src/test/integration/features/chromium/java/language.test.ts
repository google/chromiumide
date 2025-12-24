// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import * as config from '../../../../../../shared/app/services/config';
import {LanguageServerManager} from '../../../../../features/chromium/java/language';
import {StatusBar} from '../../../../../features/chromium/java/ui';
import * as testing from '../../../../testing';
import {
  ConsoleOutputChannel,
  VoidOutputChannel,
} from '../../../../testing/fakes';

// Set to true to redirect the output channel to the console and enable tracing
// the language server protocol.
const VERBOSE_LOGGING = false;

describe('Chromium Java language server', () => {
  const subscriptions: vscode.Disposable[] = [];
  const tempDir = testing.tempDir();

  afterEach(() => {
    for (const subscription of subscriptions.splice(0)) {
      subscription.dispose();
    }
  });

  for (const apiVersion of [0, 1]) {
    it(`publishes diagnostics for API v${apiVersion}`, async () => {
      if (VERBOSE_LOGGING) {
        // eslint-disable-next-line no-restricted-syntax
        await vscode.workspace
          .getConfiguration('chromiumide.chromium.java')
          .update('trace.server', 'verbose');
      }

      const extensionDir = testing.getExtensionUri().fsPath;
      const srcDir = testing.testdataUri('java/src').fsPath;
      const statusBar = new StatusBar();
      subscriptions.push(statusBar);

      // Ensure to use the fake depot_tools.
      await config.paths.depotTools.update(
        path.join(srcDir, 'third_party/depot_tools')
      );

      const manager = new LanguageServerManager(
        extensionDir,
        srcDir,
        VERBOSE_LOGGING ? new ConsoleOutputChannel() : new VoidOutputChannel(),
        statusBar,
        true /* skipCertCheck */,
        apiVersion
      );
      subscriptions.push(manager);

      const onDidChangeDiagnosticsReader = new testing.EventReader(
        vscode.languages.onDidChangeDiagnostics
      );
      subscriptions.push(onDidChangeDiagnosticsReader);

      // Open a Java doc to start a session.
      // Copy the testing Java file to a temporary directory to prevent multiple variants of this h
      // test from interfering with each other.
      const sourcePath = path.join(tempDir.path, 'Browser.java');
      await fs.promises.copyFile(
        path.join(srcDir, 'chrome/java/org/chromium/chrome/Browser.java'),
        sourcePath
      );
      const sourceUri = vscode.Uri.file(sourcePath);

      await vscode.workspace.openTextDocument(sourceUri);

      // Wait for the diagnostics to be published.
      for (;;) {
        const {uris} = await onDidChangeDiagnosticsReader.read();
        if (uris.some(uri => uri.toString() === sourceUri.toString())) {
          break;
        }
      }

      const diagnostics = vscode.languages.getDiagnostics(sourceUri);

      // The deprecated method should be reported. Note that it might not be the only diagnostic
      // because of other features of ChromiumIDE.
      expect(
        diagnostics.some(
          diagnostic =>
            diagnostic.code === 'compiler.warn.has.been.deprecated' &&
            diagnostic.range.start.line === 9
        )
      ).toBeTrue();

      // Set a longer timeout as this test may take some time to launch a Java debug server.
    }, 15000);
  }
});
