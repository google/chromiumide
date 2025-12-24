// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {URI, Utils} from 'vscode-uri';
import type * as vscode from 'vscode'; // import types only

export class Uri implements vscode.Uri {
  private constructor(private readonly uri: URI) {}

  static parse(value: string, strict?: boolean): Uri {
    return new Uri(URI.parse(value, strict));
  }
  static file(path: string): Uri {
    return new Uri(URI.file(path));
  }
  static joinPath(base: Uri, ...pathSegments: string[]): Uri {
    return new Uri(Utils.joinPath(base.uri, ...pathSegments));
  }
  static from(components: {
    scheme: string;
    authority?: string;
    path?: string;
    query?: string;
    fragment?: string;
  }): Uri {
    return new Uri(URI.from(components));
  }

  get scheme(): string {
    return this.uri.scheme;
  }
  get authority(): string {
    return this.uri.authority;
  }
  get path(): string {
    return this.uri.path;
  }
  get query(): string {
    return this.uri.query;
  }
  get fragment(): string {
    return this.uri.fragment;
  }
  get fsPath(): string {
    return this.uri.fsPath;
  }

  with(change: {
    scheme?: string;
    authority?: string;
    path?: string;
    query?: string;
    fragment?: string;
  }): vscode.Uri {
    return new Uri(this.uri.with(change));
  }
  toString(skipEncoding?: boolean): string {
    return this.uri.toString(skipEncoding);
  }
  // Unfortunately, `UriComponents` is not exported from `vscode-uri`, so we need to get it from the
  // return type.
  toJSON(): ReturnType<URI['toJSON']> {
    return this.uri.toJSON();
  }
}
