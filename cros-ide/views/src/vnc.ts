// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import RFB from '@novnc/novnc/core/rfb';

const vscode = acquireVsCodeApi<never>();

function pollWebSocket(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.addEventListener('message', () => {
      socket.close();
      resolve();
    });
    socket.addEventListener('close', (ev: CloseEvent) => {
      reject(new Error(ev.reason));
    });
  });
}

async function pollWebSocketWithRetries(url: string): Promise<void> {
  const TIMEOUT = 10 * 1000; // total time allowed to poll
  const INTERVAL = 100; // minimum interval between attempts

  const timeoutError = new Error('failed to connect to VNC server');
  const timer = new Promise<never>((_resolve, reject) => {
    setTimeout(() => {
      reject(timeoutError);
    }, TIMEOUT);
  });

  for (;;) {
    const throttle = new Promise<void>(resolve => {
      setTimeout(resolve, INTERVAL);
    });
    try {
      return await Promise.race([pollWebSocket(url), timer]);
    } catch (err: unknown) {
      if (err === timeoutError) {
        throw err;
      }
    }
    await throttle;
  }
}

async function main() {
  const container = document.getElementById('main')!;
  const proxyUrl = container.dataset.webSocketProxyUrl!;

  // Wait until the server starts.
  await pollWebSocketWithRetries(proxyUrl);

  const rfb = new RFB(container, proxyUrl);
  rfb.scaleViewport = true;
  rfb.addEventListener('connect', () => {
    vscode.postMessage({type: 'connect'});
  });
  rfb.addEventListener('disconnect', () => {
    vscode.postMessage({type: 'disconnect'});
  });
}

main();
