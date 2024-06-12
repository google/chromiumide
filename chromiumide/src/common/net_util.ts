// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as crypto from 'crypto';
import * as net from 'net';
import * as vscode from 'vscode';
import {Lsof} from './lsof';

export async function findUnusedPort(): Promise<number> {
  // Concurrent `server.listen` calls could choose the same port, and the behavior can cause test
  // flakiness if those are run in parallel. To prevent the race condition, we first try random
  // ports.
  for (let i = 0; i < 10; i++) {
    const port = crypto.randomInt(1024, 65536);
    if (!(await isPortUsed(port))) return port;
  }

  // Fall back to server.listen.
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

export async function isPortUsed(port: number): Promise<boolean> {
  return new Promise<boolean>(resolve => {
    const server = net
      .createServer()
      .once('error', err => {
        if (err.message.includes('EADDRINUSE')) {
          resolve(true);
        }
      })
      .once('listening', () => {
        server.close();
        resolve(false);
      })
      .listen(port);
  });
}

export async function findProcessUsingPort(
  port: number,
  opts?: {
    output?: vscode.OutputChannel;
    token?: vscode.CancellationToken;
  }
): Promise<{pid: number; name: string} | undefined | Error> {
  if (!(await isPortUsed(port))) {
    return undefined;
  }
  const matches = await new Lsof()
    .i(`tcp:${port}`)
    .s('tcp:listen')
    .bigF('cp')
    .run(opts);

  if (matches instanceof Error) {
    return matches;
  }

  const proc = matches.find(x => x['p']);
  if (!proc) return;

  return {
    pid: Number(proc['p']),
    name: proc['c'],
  };
}
