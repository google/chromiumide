// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as https from 'https';
import * as path from 'path';
import {Https} from '../../../common/https';
import * as netUtil from '../../../common/net_util';

const TEST_DATA = '../../../../src/test/testdata/https/';

const serverOptions = {
  key: fs.readFileSync(path.resolve(__dirname, TEST_DATA, 'key.pem')),
  cert: fs.readFileSync(path.resolve(__dirname, TEST_DATA, 'cert.pem')),
};

const requestOptions = {
  ca: [fs.readFileSync(path.resolve(__dirname, TEST_DATA, 'cert.pem'))],
  rejectUnauthorized: true,
  requestCert: true,
  agent: false,
};

describe('http get request', () => {
  let server: https.Server;

  afterEach(() => {
    server?.close();
  });

  it('returns data', async () => {
    const port = await netUtil.findUnusedPort();
    server = https
      .createServer(serverOptions, (req, resp) => {
        resp.writeHead(200);
        resp.end('hello');
      })
      .listen(port);

    await expectAsync(
      Https.getOrThrow(`https://localhost:${port}/`, requestOptions)
    ).toBeResolvedTo('hello');
  });

  it('throws on 403 (forbidden)', async () => {
    const port = await netUtil.findUnusedPort();
    server = https
      .createServer(serverOptions, (_req, resp) => {
        resp.writeHead(403);
        resp.end();
      })
      .listen(port);

    await expectAsync(
      Https.getOrThrow(`https://localhost:${port}/`, requestOptions)
    ).toBeRejectedWith(
      new Error(`GET https://localhost:${port}/: status code: 403: `)
    );
  });

  it('returns undefined on 404 (not found)', async () => {
    const port = await netUtil.findUnusedPort();
    server = https
      .createServer(serverOptions, (_req, resp) => {
        resp.writeHead(404);
        resp.end();
      })
      .listen(port);

    await expectAsync(
      Https.getOrThrow(`https://localhost:${port}/`, requestOptions)
    ).toBeResolvedTo(undefined);
  });

  it('throws on error', async () => {
    const port = await netUtil.findUnusedPort();
    server = https
      .createServer(serverOptions, (_req, resp) => {
        resp.writeHead(200);
        resp.end('hello');
      })
      .listen(port);

    // Note the absence of the `requestOptions`. The request will be rejected
    // due to a self-signed certificated.
    await expectAsync(
      Https.getOrThrow(`https://localhost:${port}/`)
    ).toBeRejectedWith(new Error('self-signed certificate'));
  });
});

describe('http delete request', () => {
  let server: https.Server;

  afterEach(() => {
    server?.close();
  });

  it('returns data', async () => {
    const port = await netUtil.findUnusedPort();
    server = https
      .createServer(serverOptions, (req, resp) => {
        resp.writeHead(200);
        resp.end('hello');
      })
      .listen(port);

    await expectAsync(
      Https.deleteOrThrow(`https://localhost:${port}/`, requestOptions)
    ).toBeResolved();
  });

  it('throws on 403 (forbidden)', async () => {
    const port = await netUtil.findUnusedPort();
    server = https
      .createServer(serverOptions, (_req, resp) => {
        resp.writeHead(403);
        resp.end();
      })
      .listen(port);

    await expectAsync(
      Https.deleteOrThrow(`https://localhost:${port}/`, requestOptions)
    ).toBeRejectedWith(
      new Error(`DELETE https://localhost:${port}/: status code: 403: `)
    );
  });

  it('throws on 404 (not found)', async () => {
    const port = await netUtil.findUnusedPort();
    server = https
      .createServer(serverOptions, (_req, resp) => {
        resp.writeHead(404);
        resp.end();
      })
      .listen(port);

    await expectAsync(
      Https.deleteOrThrow(`https://localhost:${port}/`, requestOptions)
    ).toBeRejectedWith(
      new Error(`DELETE https://localhost:${port}/: status code: 404: `)
    );
  });

  it('throws on error', async () => {
    const port = await netUtil.findUnusedPort();
    server = https
      .createServer(serverOptions, (_req, resp) => {
        resp.writeHead(200);
        resp.end('hello');
      })
      .listen(port);

    // Note the absence of the `requestOptions`. The request will be rejected
    // due to a self-signed certificated.
    await expectAsync(
      Https.deleteOrThrow(`https://localhost:${port}/`)
    ).toBeRejectedWith(new Error('self-signed certificate'));
  });
});

describe('http put request', () => {
  let server: https.Server;

  afterEach(() => {
    server?.close();
  });

  it('returns data', async () => {
    const port = await netUtil.findUnusedPort();
    server = https
      .createServer(serverOptions, (req, resp) => {
        resp.writeHead(200);
        resp.end('hello');
      })
      .listen(port);

    await expectAsync(
      Https.putJsonOrThrow(`https://localhost:${port}/`, 'hi', requestOptions)
    ).toBeResolvedTo('hello');
  });

  it('throws on 403 (forbidden)', async () => {
    const port = await netUtil.findUnusedPort();
    server = https
      .createServer(serverOptions, (_req, resp) => {
        resp.writeHead(403);
        resp.end();
      })
      .listen(port);

    await expectAsync(
      Https.putJsonOrThrow(`https://localhost:${port}/`, 'hi', requestOptions)
    ).toBeRejectedWith(
      new Error(`PUT https://localhost:${port}/: status code: 403: `)
    );
  });

  it('throws on 404 (not found)', async () => {
    const port = await netUtil.findUnusedPort();
    server = https
      .createServer(serverOptions, (_req, resp) => {
        resp.writeHead(404);
        resp.end();
      })
      .listen(port);

    await expectAsync(
      Https.putJsonOrThrow(`https://localhost:${port}/`, 'hi', requestOptions)
    ).toBeRejectedWith(
      new Error(`PUT https://localhost:${port}/: status code: 404: `)
    );
  });

  it('throws on error', async () => {
    const port = await netUtil.findUnusedPort();
    server = https
      .createServer(serverOptions, (_req, resp) => {
        resp.writeHead(200);
        resp.end('hello');
      })
      .listen(port);

    // Note the absence of the `requestOptions`. The request will be rejected
    // due to a self-signed certificated.
    await expectAsync(
      Https.putJsonOrThrow(`https://localhost:${port}/`, 'hi')
    ).toBeRejectedWith(new Error('self-signed certificate'));
  });
});

describe('http post request', () => {
  let server: https.Server;

  afterEach(() => {
    server?.close();
  });

  it('returns data', async () => {
    const port = await netUtil.findUnusedPort();
    server = https
      .createServer(serverOptions, (req, resp) => {
        resp.writeHead(200);
        resp.end('hello');
      })
      .listen(port);

    await expectAsync(
      Https.postJsonOrThrow(`https://localhost:${port}/`, 'hi', requestOptions)
    ).toBeResolvedTo('hello');
  });

  it('throws on 403 (forbidden)', async () => {
    const port = await netUtil.findUnusedPort();
    server = https
      .createServer(serverOptions, (_req, resp) => {
        resp.writeHead(403);
        resp.end();
      })
      .listen(port);

    await expectAsync(
      Https.postJsonOrThrow(`https://localhost:${port}/`, 'hi', requestOptions)
    ).toBeRejectedWith(
      new Error(`POST https://localhost:${port}/: status code: 403: `)
    );
  });

  it('throws on 404 (not found)', async () => {
    const port = await netUtil.findUnusedPort();
    server = https
      .createServer(serverOptions, (_req, resp) => {
        resp.writeHead(404);
        resp.end();
      })
      .listen(port);

    await expectAsync(
      Https.postJsonOrThrow(`https://localhost:${port}/`, 'hi', requestOptions)
    ).toBeRejectedWith(
      new Error(`POST https://localhost:${port}/: status code: 404: `)
    );
  });

  it('throws on error', async () => {
    const port = await netUtil.findUnusedPort();
    server = https
      .createServer(serverOptions, (_req, resp) => {
        resp.writeHead(200);
        resp.end('hello');
      })
      .listen(port);

    // Note the absence of the `requestOptions`. The request will be rejected
    // due to a self-signed certificated.
    await expectAsync(
      Https.postJsonOrThrow(`https://localhost:${port}/`, 'hi')
    ).toBeRejectedWith(new Error('self-signed certificate'));
  });
});
