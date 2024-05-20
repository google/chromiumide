// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as path from 'path';
import {
  CompilationDatabase,
  CompilationDatabaseEntry,
} from './compilation_database_type';

/**
 * Checks the content of compilation_database.json and returns whether all the files exist.
 */
export function checkCompilationDatabase(
  content: CompilationDatabase
): boolean {
  for (const entry of content) {
    if (!checkEntry(entry)) {
      return false;
    }
  }
  return true;
}

function checkEntry(entry: CompilationDatabaseEntry): boolean {
  const filePath = path.isAbsolute(entry.file)
    ? entry.file
    : path.join(entry.directory, entry.file);
  return fs.existsSync(filePath);
}
