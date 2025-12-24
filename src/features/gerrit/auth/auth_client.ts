// Copyright 2025 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

export interface GerritRequest {
  method: 'GET' | 'PUT' | 'DELETE';
  url: string;
  data?: Object;
}

export interface AuthClient {
  /**
   * Requests a fetch from the url that looks like https://xxx.googlesource.com.
   * The data is if given stringified as a JSON and included in the payload.
   * The client may rewrite the URL to get authentication properly working.
   *
   * This method throws if the returned status code is not 2xx.
   */
  request(config: GerritRequest): Promise<string>;
}
