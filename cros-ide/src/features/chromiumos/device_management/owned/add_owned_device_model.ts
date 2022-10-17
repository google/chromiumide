// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

export type DutConnectionConfig = {
  readonly location: string; // DutLocation enum,
  readonly ipAddress: string;
  readonly forwardedPort: number | null;
  readonly hostname: string;
  readonly addToSshConfig: boolean;
  readonly addToHostsFile: boolean;
};

export class AddOwnedDeviceViewContext {
  constructor(readonly username: string) {}
}
