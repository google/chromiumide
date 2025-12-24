// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as path from 'path';
import {Disposable} from 'vscode';
import * as vscode from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  NodeModule,
  ServerOptions,
  TransportKind,
} from 'vscode-languageclient/node';
import {driver} from '../../../../shared/app/common/chromiumos/cros';
import type {InitializationOptions} from '../../../../server/ebuild_lsp/shared/constants';
import type {MetricsEvent} from '../../../../server/ebuild_lsp/shared/event';

export class EbuildLspClient implements Disposable {
  private readonly client: LanguageClient;
  private readonly subscriptions: vscode.Disposable[] = [];

  /** Instantiates the client, `start` should be called for the feature to start working. */
  constructor(
    extensionUri: vscode.Uri,
    chromiumosRoot: string,
    outputChannel?: vscode.OutputChannel,
    remoteName = vscode.env.remoteName
  ) {
    const serverModule = path.join(extensionUri.fsPath, 'dist/server.js');

    const nodeModule: NodeModule = {
      module: serverModule,
      args: ['--lsp', 'ebuild'],
      transport: TransportKind.ipc,
    };

    const serverOptions: ServerOptions = {
      run: nodeModule,
      debug: nodeModule,
    };

    const initializationOptions: InitializationOptions = {
      chromiumosRoot,
      remoteName,
    };

    const clientOptions: LanguageClientOptions = {
      documentSelector: [
        {
          scheme: 'file',
          pattern: '**/*.{ebuild,eclass}',
        },
      ],
      outputChannel,
      initializationOptions,
    };

    this.client = new LanguageClient(
      'ebuildLsp',
      'ChromiumIDE: Ebuild LSP',
      serverOptions,
      clientOptions
    );

    this.subscriptions.push(
      this.client,
      this.client.onNotification('custom/metrics', (event: MetricsEvent) => {
        driver.metrics.send(event);
      })
    );
  }

  /** Starts the client. This will also launch the server. */
  async start(): Promise<void> {
    try {
      await this.client.start();
    } catch (e) {
      await vscode.window.showErrorMessage(
        `Internal error: ebuild LSP; client.start(): ${e}`
      );
    }
  }

  dispose(): void {
    void this.disposeAsync();
  }

  async disposeAsync(): Promise<void> {
    try {
      await this.client.stop();
    } catch (e) {
      await vscode.window.showErrorMessage(
        `Internal error: ebuild LSP; client.stop(): ${e}`
      );
    }
    vscode.Disposable.from(...this.subscriptions.splice(0).reverse()).dispose();
  }
}
