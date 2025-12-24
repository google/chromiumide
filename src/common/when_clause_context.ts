// Copyright 2025 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as vscode from 'vscode';

/**
 * All the custom when clause context keys should be declared here with description.
 * The `setContext` command should not be directly called outside this file.
 *
 * For other context keys that VSCode provides, see https://code.visualstudio.com/api/references/when-clause-contexts#available-context-keys.
 */
export class CustomContext<T> {
  /** Set when chrome is opened with the src and src-internal directory paths. */
  static readonly chromiumSrcUris = new CustomContext<vscode.Uri[]>(
    'chromiumide.chromium.src-uris'
  );
  /** Set when anything under chromeos repository is opened with the chroot path. */
  static readonly chrootPath = new CustomContext<string>(
    'chromiumide.chrootPath'
  );

  private constructor(private readonly key: `chromiumide.${string}`) {}

  async set(
    value: T,
    subscriptions?: vscode.Disposable[]
  ): Promise<vscode.Disposable> {
    await vscode.commands.executeCommand('setContext', this.key, value);
    const disposable = new vscode.Disposable(() =>
      vscode.commands.executeCommand('setContext', this.key, undefined)
    );
    subscriptions?.push(disposable);
    return disposable;
  }
}
