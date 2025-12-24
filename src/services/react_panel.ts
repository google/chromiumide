// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';

/**
 * Base class for a React-based webview panel, simplifying and providing the boilerplate.
 *
 * It generates the appropriate HTML that loads dependencies and given view script, and simplifies
 * handling messages from the webview and sending initial data. See also ReactPanelHelper for use
 * by the view script.
 */
export abstract class ReactPanel<TInitialData> {
  private static readonly GET_INITIAL_DATA_MESSAGE =
    'reactPanel.getInitialData';
  private static readonly GET_INITIAL_DATA_RESPONSE_MESSAGE =
    'reactPanel.getInitialData.response';

  protected readonly panel: vscode.WebviewPanel;

  protected readonly disposables: vscode.Disposable[] = [];

  /**
   * ReactPanel constructor.
   *
   * @param scriptNameNoExt Name of the .tsx view script, but without the extension.
   * @param extensionUri Extension URI from vscode context.
   * @param title Title for the webview.
   * @param initialData Initial data to be sent to the view script, which is sandboxed inside the
   * webview, or null if the view will not request it. @see receiveInitialData in react_panel_helper.
   * @param options Options.
   * - `retainContextWhenHidden`: Whether to retain all the context or terminate the script
   *   (default) each time the webview gets background.
   * - `column`: ViewColumn in which to place the WebView (One by default).
   * - `viewType`: vscode view type (ID). Defaults to the script name (no extension).
   */
  protected constructor(
    scriptNameNoExt: string,
    protected readonly extensionUri: vscode.Uri,
    title: string,
    initialData: TInitialData | null,
    options?: {
      retainContextWhenHidden?: boolean;
      column?: vscode.ViewColumn;
      viewType?: string;
    }
  ) {
    const {retainContextWhenHidden, column, viewType} = options ?? {};
    this.panel = vscode.window.createWebviewPanel(
      viewType ?? scriptNameNoExt,
      title,
      column ?? vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden,
      }
    );

    this.panel.webview.html = this.getHtmlForWebview(
      scriptNameNoExt + '.js',
      scriptNameNoExt + '.css'
    );

    // Listen for when the panel is disposed.
    // This happens when the user closes the panel or when the panel is closed
    // programmatically.
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    this.panel.webview.onDidReceiveMessage(
      async message => {
        if (message.command === ReactPanel.GET_INITIAL_DATA_MESSAGE) {
          if (initialData === null) {
            throw new Error('Initial data requested, but none set.');
          }
          void this.panel.webview.postMessage({
            command: ReactPanel.GET_INITIAL_DATA_RESPONSE_MESSAGE,
            data: initialData!,
          });
        } else {
          this.handleWebviewMessage(message);
        }
      },
      null,
      this.disposables
    );
  }

  /**
   * Implement this to handle messages passed from the webview script (which
   * are sent via vscode.WebviewApi.postMessage()).
   */
  protected abstract handleWebviewMessage(_message: unknown): void;

  dispose(): void {
    this.panel.dispose();
    this.disposables.forEach(d => d.dispose());
  }

  private getUri(path: string): vscode.Uri {
    return this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, path)
    );
  }

  private getHtmlForWebview(script: string, stylesheet: string): string {
    return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width,initial-scale=1,shrink-to-fit=no">
        <!-- <meta name="theme-color" content="#000000"> -->
        <title>This title should not be visible</title>
        <base href="${this.getUri('/dist/views/')}">
        <link rel="stylesheet" href="${stylesheet}">
        <link rel="stylesheet"
           href="https://fonts.googleapis.com/css?family=Roboto:300,400,500,700&display=swap" />
        <link rel="stylesheet"
           href="https://fonts.googleapis.com/icon?family=Material+Icons" />
        <link href="vscode/codicon.css" rel="stylesheet" />
    </head>

      <body>
        <noscript>You need to enable JavaScript to run this app.</noscript>
        <div id="root" />
        <div>
          <p>Loading Webview...</p>
        </div>

        <script src="${script}"></script>
      </body>
      </html>`;
  }
}
