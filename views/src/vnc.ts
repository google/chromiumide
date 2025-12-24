// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import RFB, {DataChannel} from '@novnc/novnc/core/rfb';
import {Base64} from 'js-base64';
import * as webviewShared from '../../src/features/device_management/webview_shared';

const vscode = acquireVsCodeApi<never>();

// Type-safe wrapper of vscode.postMessage().
function postClientMessage(message: webviewShared.ClientMessage): void {
  vscode.postMessage(message);
}

// https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/readyState
const READY_STATE = {
  connecting: 0,
  open: 1,
  closing: 2,
  closed: 3,
} as const;

// Implements DataChannel over the WebView's message passing mechanism.
class MessagePassingDataChannel implements DataChannel {
  private static nextSocketId = 1;

  private readonly socketId = MessagePassingDataChannel.nextSocketId++;
  private readyStateValue: number = READY_STATE.connecting;
  // Cached for window.removeEventListener().
  private readonly onMessageListener = this.onMessage.bind(this);

  constructor() {
    postClientMessage({
      type: 'socket',
      subtype: 'open',
      socketId: this.socketId,
    });
    window.addEventListener('message', this.onMessageListener);
  }

  get binaryType(): string {
    return 'arraybuffer';
  }

  set binaryType(t: string) {
    if (t !== 'arraybuffer') {
      throw new Error(
        `MessagePassingDataChannel: unsupported binary type ${t} requested`
      );
    }
  }

  readonly protocol = webviewShared.MESSAGE_PASSING_URL;

  get readyState(): number {
    return this.readyStateValue;
  }

  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;

  send(data: ArrayBuffer): void {
    postClientMessage({
      type: 'socket',
      subtype: 'data',
      socketId: this.socketId,
      data: Base64.fromUint8Array(new Uint8Array(data)),
    });
  }

  close(): void {
    postClientMessage({
      type: 'socket',
      subtype: 'close',
      socketId: this.socketId,
    });
    window.removeEventListener('message', this.onMessageListener);
    this.readyStateValue = READY_STATE.closed;
  }

  private onMessage(ev: MessageEvent<webviewShared.ServerMessage>): void {
    const message = ev.data;
    const {type, subtype} = message;
    if (type !== 'socket') {
      return;
    }
    const {socketId} = message;
    if (socketId !== this.socketId) {
      return;
    }

    switch (subtype) {
      case 'open': {
        const ev = new Event('open');
        this.readyStateValue = READY_STATE.open;
        if (this.onopen) {
          this.onopen(ev);
        }
        break;
      }
      case 'data': {
        const {data} = message;
        if (typeof data !== 'string') {
          break;
        }
        const array = Base64.toUint8Array(data);
        const ev = new MessageEvent('message', {data: array.buffer});
        if (this.onmessage) {
          this.onmessage(ev);
        }
        break;
      }
      case 'error': {
        const ev = new Event('error');
        this.readyStateValue = READY_STATE.closing;
        if (this.onerror) {
          this.onerror(ev);
        }
        break;
      }
      case 'close': {
        this.readyStateValue = READY_STATE.closed;
        const ev = new CloseEvent('close');
        if (this.onclose) {
          this.onclose(ev);
        }
        break;
      }
    }
  }
}

function openDataChannel(url: string): DataChannel {
  if (url === webviewShared.MESSAGE_PASSING_URL) {
    return new MessagePassingDataChannel();
  }
  return new WebSocket(url);
}

function onReady(): void {
  const spinner = document.getElementById('loading')!;
  const container = document.getElementById('main')!;
  const proxyUrl = container.dataset.webSocketProxyUrl!;
  const rfb = new RFB(container, openDataChannel(proxyUrl));
  rfb.scaleViewport = true;
  rfb.addEventListener('connect', () => {
    spinner.classList.add('loaded');
    postClientMessage({type: 'event', subtype: 'connect'});
  });
  rfb.addEventListener('disconnect', () => {
    postClientMessage({type: 'event', subtype: 'disconnect'});
  });
}

function main(): void {
  postClientMessage({
    type: 'event',
    subtype: 'ready',
  });

  window.addEventListener(
    'message',
    (ev: MessageEvent<webviewShared.ServerMessage>) => {
      const {type, subtype} = ev.data;
      if (type === 'event' && subtype === 'ready') {
        onReady();
      }
    }
  );
}

main();
