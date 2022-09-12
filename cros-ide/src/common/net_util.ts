// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as net from 'net';

export async function findUnusedPort(): Promise<number> {
  return new Promise<number>(resolve => {
    const server = net.createServer();
    server.listen(0, 'localhost', () => {
      const port = (server.address() as net.AddressInfo).port;
      server.close(() => {
        resolve(port);
      });
    });
  });
}
