// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

interface ReplacePattern {
  from: RegExp;
  to: string;
}

export function replaceAll(s: string, patterns: ReplacePattern[]): string {
  for (const pattern of patterns) {
    s = s.replace(pattern.from, pattern.to);
  }
  return s;
}
