// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

export type Path = Readonly<{
  join: (...paths: string[]) => string;
  dirname: (path: string) => string;
  basename: (path: string, suffix?: string | undefined) => string;
  /** {@link https://nodejs.org/api/path.html#pathrelativefrom-to} */
  relative: (from: string, to: string) => string;
  resolve: (...paths: string[]) => string;
  sep: string;
}>;
