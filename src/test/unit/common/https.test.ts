// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as https from 'https';
import {Https, HttpsError} from '../../../common/https';
import * as netUtil from '../../../common/net_util';
import * as testing from '../../testing';

const serverOptions = {
  key: testing.testdataString('https/key.pem'),
  cert: testing.testdataString('https/cert.pem'),
};

const requestOptions = {
  ca: testing.testdataString('https/cert.pem'),
  rejectUnauthorized: true,
  requestCert: true,
  agent: false,
};

async function listen(server: https.Server, port: number) {
  const listening = new Promise(resolve => server.on('listening', resolve));
  server.listen(port);
  await listening;
}

describe('http get request', () => {
  let server: https.Server;

  afterEach(() => {
    server?.close();
  });

  it('returns data', async () => {
    server = https.createServer(serverOptions, (req, resp) => {
      resp.writeHead(200);
      resp.end('hello');
    });
    const port = await netUtil.findUnusedPort();
    await listen(server, port);

    await expectAsync(
      Https.getOrThrow(`https://localhost:${port}/`, requestOptions)
    ).toBeResolvedTo('hello');
  });

  it('throws on 403 (forbidden)', async () => {
    server = https.createServer(serverOptions, (_req, resp) => {
      resp.writeHead(403);
      resp.end();
    });
    const port = await netUtil.findUnusedPort();
    await listen(server, port);

    await expectAsync(
      Https.getOrThrow(`https://localhost:${port}/`, requestOptions)
    ).toBeRejectedWith(
      new HttpsError('GET', `https://localhost:${port}/`, '', 403)
    );
  });

  it('throws on 404 (not found)', async () => {
    server = https.createServer(serverOptions, (_req, resp) => {
      resp.writeHead(404);
      resp.end();
    });
    const port = await netUtil.findUnusedPort();
    await listen(server, port);

    await expectAsync(
      Https.getOrThrow(`https://localhost:${port}/`, requestOptions)
    ).toBeRejectedWith(
      new Error(`GET https://localhost:${port}/: status code: 404: `)
    );
  });

  it('throws on error', async () => {
    server = https.createServer(serverOptions, (_req, resp) => {
      resp.writeHead(200);
      resp.end('hello');
    });
    const port = await netUtil.findUnusedPort();
    await listen(server, port);

    // Note the absence of the `requestOptions`. The request will be rejected
    // due to a self-signed certificated.
    await expectAsync(
      Https.getOrThrow(`https://localhost:${port}/`)
    ).toBeRejectedWith(
      new HttpsError(
        'GET',
        `https://localhost:${port}/`,
        'self-signed certificate'
      )
    );
  });
});

describe('http delete request', () => {
  let server: https.Server;

  afterEach(() => {
    server?.close();
  });

  it('returns data', async () => {
    server = https.createServer(serverOptions, (req, resp) => {
      resp.writeHead(200);
      resp.end('hello');
    });
    const port = await netUtil.findUnusedPort();
    await listen(server, port);

    await expectAsync(
      Https.deleteOrThrow(`https://localhost:${port}/`, requestOptions)
    ).toBeResolved();
  });

  it('throws on 403 (forbidden)', async () => {
    server = https.createServer(serverOptions, (_req, resp) => {
      resp.writeHead(403);
      resp.end();
    });
    const port = await netUtil.findUnusedPort();
    await listen(server, port);

    await expectAsync(
      Https.deleteOrThrow(`https://localhost:${port}/`, requestOptions)
    ).toBeRejectedWith(
      new HttpsError('DELETE', `https://localhost:${port}/`, '', 403)
    );
  });

  it('throws on error', async () => {
    server = https.createServer(serverOptions, (_req, resp) => {
      resp.writeHead(200);
      resp.end('hello');
    });
    const port = await netUtil.findUnusedPort();
    await listen(server, port);

    // Note the absence of the `requestOptions`. The request will be rejected
    // due to a self-signed certificated.
    await expectAsync(
      Https.deleteOrThrow(`https://localhost:${port}/`)
    ).toBeRejectedWith(
      new HttpsError(
        'DELETE',
        `https://localhost:${port}/`,
        'self-signed certificate'
      )
    );
  });
});

describe('http put request', () => {
  let server: https.Server;

  afterEach(() => {
    server?.close();
  });

  it('returns data', async () => {
    server = https.createServer(serverOptions, (req, resp) => {
      resp.writeHead(200);
      resp.end('hello');
    });
    const port = await netUtil.findUnusedPort();
    await listen(server, port);

    await expectAsync(
      Https.putJsonOrThrow(`https://localhost:${port}/`, 'hi', requestOptions)
    ).toBeResolvedTo('hello');
  });

  it('throws on 403 (forbidden)', async () => {
    server = https.createServer(serverOptions, (_req, resp) => {
      resp.writeHead(403);
      resp.end();
    });
    const port = await netUtil.findUnusedPort();
    await listen(server, port);

    await expectAsync(
      Https.putJsonOrThrow(`https://localhost:${port}/`, 'hi', requestOptions)
    ).toBeRejectedWith(
      new HttpsError('PUT', `https://localhost:${port}/`, '', 403)
    );
  });

  it('throws on error', async () => {
    server = https.createServer(serverOptions, (_req, resp) => {
      resp.writeHead(200);
      resp.end('hello');
    });
    const port = await netUtil.findUnusedPort();
    await listen(server, port);

    // Note the absence of the `requestOptions`. The request will be rejected
    // due to a self-signed certificated.
    await expectAsync(
      Https.putJsonOrThrow(`https://localhost:${port}/`, 'hi')
    ).toBeRejectedWith(
      new HttpsError(
        'PUT',
        `https://localhost:${port}/`,
        'self-signed certificate'
      )
    );
  });
});

describe('http post request', () => {
  let server: https.Server;

  afterEach(() => {
    server?.close();
  });

  it('returns data', async () => {
    server = https.createServer(serverOptions, (req, resp) => {
      resp.writeHead(200);
      resp.end('hello');
    });
    const port = await netUtil.findUnusedPort();
    await listen(server, port);

    await expectAsync(
      Https.postJsonOrThrow(`https://localhost:${port}/`, 'hi', requestOptions)
    ).toBeResolvedTo('hello');
  });

  it('throws on 403 (forbidden)', async () => {
    server = https.createServer(serverOptions, (_req, resp) => {
      resp.writeHead(403);
      resp.end();
    });
    const port = await netUtil.findUnusedPort();
    await listen(server, port);

    await expectAsync(
      Https.postJsonOrThrow(`https://localhost:${port}/`, 'hi', requestOptions)
    ).toBeRejectedWith(
      new HttpsError('POST', `https://localhost:${port}/`, '', 403)
    );
  });

  it('throws on error', async () => {
    server = https.createServer(serverOptions, (_req, resp) => {
      resp.writeHead(200);
      resp.end('hello');
    });
    const port = await netUtil.findUnusedPort();
    await listen(server, port);

    // Note the absence of the `requestOptions`. The request will be rejected
    // due to a self-signed certificated.
    await expectAsync(
      Https.postJsonOrThrow(`https://localhost:${port}/`, 'hi')
    ).toBeRejectedWith(
      new HttpsError(
        'POST',
        `https://localhost:${port}/`,
        'self-signed certificate'
      )
    );
  });
});
