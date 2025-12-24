// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as https from 'https';

export class HttpsError extends Error {
  constructor(
    readonly method: string,
    readonly url: string,
    readonly chunks: string,
    readonly statusCode?: number
  ) {
    super(`${method} ${url}: status code: ${statusCode ?? 'NA'}: ${chunks}`);
  }
}

export class Https {
  /**
   * Fetches a raw string from https.
   *
   * Returns the response if it is successful.
   * Everything else throws an HttpsError.
   */
  static async getOrThrow(
    url: string,
    options: https.RequestOptions = {}
  ): Promise<string> {
    return this.httpsRequest(url, options, 'GET');
  }

  /**
   * Sends a delete request.
   *
   * Throws an HttpsError if the response is not successful (the status code is not 2xx).
   */
  static async deleteOrThrow(
    url: string,
    options: https.RequestOptions = {}
  ): Promise<void> {
    await this.httpsRequest(url, options, 'DELETE');
  }

  /**
   * Sends PUT request over https.
   *
   * Returns the response if it is successful (2xx).
   * Otherwise throws an HttpsError.
   */
  static async putJsonOrThrow(
    url: string,
    postData: Object,
    options: https.RequestOptions = {}
  ): Promise<string> {
    const postDataString = JSON.stringify(postData);

    const opts = {
      ...options,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(postDataString),
        ...options.headers,
      },
    };

    return this.httpsRequest(url, opts, 'PUT', postDataString);
  }

  /**
   * Sends POST request over https.
   *
   * Returns the response if it is successful (2xx).
   * Otherwise throws an HttpsError.
   */
  static async postJsonOrThrow(
    url: string,
    postData: Object,
    options: https.RequestOptions = {}
  ): Promise<string> {
    const postDataString = JSON.stringify(postData);

    const opts = {
      ...options,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(postDataString),
        ...options.headers,
      },
    };

    return this.httpsRequest(url, opts, 'POST', postDataString);
  }

  static async httpsRequest(
    url: string,
    opts: https.RequestOptions,
    method: 'PUT' | 'POST' | 'DELETE' | 'GET',
    writable?: string
  ): Promise<string> {
    const chunks: Uint8Array[] = [];
    return new Promise((resolve, reject) => {
      const req = https
        .request(url, {...opts, method: method}, res => {
          res.on('data', data => chunks.push(data));
          res.on('end', () => {
            if (
              res.statusCode &&
              200 <= res.statusCode &&
              res.statusCode < 300
            ) {
              resolve(Buffer.concat(chunks).toString());
            }
            reject(
              new HttpsError(
                method,
                url,
                Buffer.concat(chunks).toString(),
                res.statusCode
              )
            );
          });
        })
        .on('error', error => {
          reject(new HttpsError(method, url, error.message));
        });

      if (writable) {
        req.write(writable);
      }
      req.end();
    });
  }
}
