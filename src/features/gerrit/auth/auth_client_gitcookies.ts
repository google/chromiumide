// Copyright 2025 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import axios from 'axios';
import {AuthClient, GerritRequest} from './auth_client';

export class AuthClientGitCookies implements AuthClient {
  constructor(private readonly authCookie: string) {}

  async request({method, url, data}: GerritRequest): Promise<string> {
    const headers: Record<string, string> = {
      cookie: this.authCookie,
    };
    const dataString = data ? JSON.stringify(data) : undefined;
    if (dataString) {
      headers['Content-Type'] = 'application/json; charset=utf-8';
      headers['Content-Length'] = Buffer.byteLength(dataString).toString();
    }
    const response = await axios({
      method,
      url,
      headers,
      data: dataString ?? '',
    });
    return response.data;
  }
}
