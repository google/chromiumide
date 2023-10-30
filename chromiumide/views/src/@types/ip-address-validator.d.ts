// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

declare module 'ip-address-validator' {
  export function isIPAddress(ipAddress: string): boolean;
  export function isIPV4Address(ipAddress: string): boolean;
  export function isIPV6Address(ipAddress: string): boolean;
  export function ipVersion(ipAddress: string): number | string;
}
