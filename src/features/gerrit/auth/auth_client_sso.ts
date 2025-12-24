// Copyright 2025 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import axios from 'axios';
import {execOrThrow} from '../../../../shared/app/common/common_util';
import {AuthClient, GerritRequest} from './auth_client';

const SSO_URL = 'sso://*.git.corp.google.com';

export class AuthClientSso implements AuthClient {
  constructor(private readonly gitRemoteSso = '/usr/bin/git-remote-sso') {}

  async request({method, url, data}: GerritRequest): Promise<string> {
    const headers: Record<string, string> = {};
    const dataString = data ? JSON.stringify(data) : undefined;
    if (dataString) {
      headers['Content-Type'] = 'application/json; charset=utf-8';
      headers['Content-Length'] = Buffer.byteLength(dataString).toString();
    }

    if (!needsAuthentication(url)) {
      const response = await axios({
        method,
        url,
        headers,
        data: dataString ?? '',
      });
      return response.data;
    }

    const {httpProxy, httpCookiefile, includePath} = await this.readSsoConfig();

    if (includePath) {
      const result = await execOrThrow('git', [
        '-c',
        'color.ui=never',
        'config',
        '-f',
        includePath,
        '--get',
        'http.extraHeader',
      ]);
      const [key, value] = result.stdout.split(':');
      headers[key.trim()] = value.trim();
    }

    headers['Cookie'] = await parseCookieFile(httpCookiefile);

    const config = {
      method,
      url: rewriteUrl(url),
      headers,
      data: dataString ?? '',
      proxy: {
        host: httpProxy.split(':')[0],
        port: Number(httpProxy.split(':')[1]),
        protocol: 'http',
      },
    };

    return (await axios(config)).data;
  }

  private async readSsoConfig(): Promise<{
    httpProxy: string;
    httpCookiefile: string;
    includePath: string;
  }> {
    // TODO(oka): Ensure cert, but don't spam the user when gcertstatus returns an error
    // although the cert actually exists.

    const result = await execOrThrow(
      this.gitRemoteSso,
      ['-print_config', SSO_URL],
      {ignoreNonZeroExit: true}
    );

    const requiredFields = new Set([
      'http.proxy',
      'http.cookiefile',
      'include.path',
    ]);
    const config: Record<string, string> = {};

    for (const line of result.stdout.split('\n')) {
      if (!line) continue;

      const [key, value] = line.split('=', 2);
      if (requiredFields.has(key)) {
        config[key] = value ?? '';
      }
    }

    if (Object.keys(config).length !== requiredFields.size) {
      const missingFields = Array.from(requiredFields).filter(
        f => !(f in config)
      );
      missingFields.sort();
      throw new Error(
        `git-remote-sso exited with code ${
          result.exitStatus
        }; missing fields = ${missingFields.join(', ')}; stderr = ${
          result.stderr
        }`
      );
    }

    return {
      httpProxy: config['http.proxy'],
      httpCookiefile: config['http.cookiefile'],
      includePath: config['include.path'],
    };
  }
}

const AUTHENTICATED_URL_RE = /^https:\/\/[^/]*\/a\//;

function needsAuthentication(url: string): boolean {
  return AUTHENTICATED_URL_RE.test(url);
}

async function parseCookieFile(cookieFilePath: string): Promise<string> {
  const content = await fs.promises.readFile(cookieFilePath, 'utf-8');
  const lines = content
    .split('\n')
    .filter(line => !line.startsWith('# ') && line.trim() !== '');

  const cookies: string[] = [];

  for (const line of lines) {
    const fields = line.split('\t');
    if (fields.length >= 7) {
      const name = fields[5];
      const value = fields[6];
      cookies.push(`${name}=${value}`);
    }
  }
  return cookies.join('; ');
}

const HTTPS_URL_RE = /^https:\/\/([^/]+)\.googlesource\.com(.*)$/;

function rewriteUrl(url: string): string {
  const m = HTTPS_URL_RE.exec(url);
  if (!m) return url;
  return `http://${m[1]}.git.corp.google.com${m[2]}`;
}
