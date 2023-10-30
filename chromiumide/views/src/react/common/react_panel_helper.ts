// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @fileoverview This module helps a ReactPanel based webview's script (.tsx)
 * work with its ReactPanel instance.
 */

import * as ReactDOM from 'react-dom/client';
import type {WebviewApi} from 'vscode-webview';

/**
 * Gets the initial context data for this view, as passed to the
 * @see ReactPanel constructor.
 *
 * @param vscodeApi The @WebviewApi as returned by acquired by the single call
 * to acquireVsCodeApi() in your view script.
 * @returns The initial data.
 */
export function receiveInitialData<T>(
  vscodeApi: WebviewApi<unknown>
): Promise<T> {
  return new Promise<T>((resolve, _reject) => {
    window.addEventListener('message', handleContextMessage);
    vscodeApi.postMessage({command: 'reactPanel.getInitialData'});

    function handleContextMessage(
      event: MessageEvent<{command: string; data: T}>
    ) {
      const message = event.data;
      if (message.command === 'reactPanel.getInitialData.response') {
        resolve(message.data);
        window.removeEventListener('message', handleContextMessage);
      }
    }
  });
}

/**
 * Mounts the root element of your view script into your @see ReactPanel
 * @see Webview. Call this from your view script.
 *
 * @param elem Root element.
 */
export function createAndRenderRoot(elem: JSX.Element): void {
  const rootElem = document.getElementById('root')!;
  ReactDOM.createRoot(rootElem).render(elem);
}
