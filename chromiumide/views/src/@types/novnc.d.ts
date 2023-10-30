// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

declare module '@novnc/novnc/core/rfb' {
  export interface RFBOptions {
    shared?: boolean;
  }

  export interface DataChannel {
    binaryType: string;
    readonly protocol: string;
    readonly readyState: number;

    onopen: ((ev: Event) => void) | null;
    onmessage: ((data: MessageEvent) => void) | null;
    onerror: ((err: Event) => void) | null;
    onclose: ((err: CloseEvent) => void) | null;

    send: (data: ArrayBuffer) => void;
    close: () => void;
  }

  export default class RFB {
    constructor(
      target: HTMLElement,
      urlOrDataChannel: string | DataChannel,
      options?: RFBOptions
    );

    viewOnly: boolean;
    scaleViewport: boolean;

    addEventListener(type: string, listener: EventListener): void;
  }
}
