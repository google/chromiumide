// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

export type CompilationDatabase = CompilationDatabaseEntry[];

export type CompilationDatabaseEntry = {
  directory: string;
  command: string;
  file: string;
  output: string;
};
