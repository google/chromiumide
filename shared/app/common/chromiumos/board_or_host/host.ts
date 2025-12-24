// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {CommonInterface, HOST_AS_STRING} from './common_interface';

export class Host implements CommonInterface {
  private static SINGLETON = new Host();

  static getInstance(): Host {
    return Host.SINGLETON;
  }

  private constructor() {}

  map<T>(_f: (board: string) => T, v: T): T {
    return v;
  }

  toString(): string {
    return HOST_AS_STRING;
  }

  toBoardName(): string {
    return 'amd64-host';
  }

  sysroot(): string {
    return '/';
  }

  suffixedExecutable(
    name: 'emerge' | 'equery' | 'ebuild' | 'portageq'
  ): string {
    return name;
  }
}
