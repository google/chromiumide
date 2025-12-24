// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {getDriver} from '../../common/driver_repository';

/**
 * Utilities to analyze whether files are exempted from pre-upload check based on .presubmitignore.
 */

const driver = getDriver();

// File containing wildcards, one per line, matching files that should be
// excluded from presubmit checks. Lines beginning with '#' are ignored.
const IGNORE_FILE = '.presubmitignore';
const IGNORED_WILDCARDS_CACHE = new Map<string, string[]>();

/**
 * Given a file in a CrOS repo, returns whether it matches a pattern in any .presubmitignore in its
 * ancestor directories up until the repo root directory, and therefore should be ignored.
 *
 * @param fileName absolute path of the tested file
 * @param crosRoot absolute path of the CrOS checkout the tested file belongs to
 *
 * See the pre-upload script where this function is based on:
 * https://source.corp.google.com/h/chromium/chromiumos/codesearch/+/main:src/repohooks/pre-upload.py?q=_path_is_ignored
 * TODO(b/334700788): update reference when there is proper documentation.
 */
export async function isPresubmitignored(
  fileName: string,
  crosRoot: string,
  output?: vscode.OutputChannel
): Promise<boolean> {
  // This should not happen if the function is called correctly. See function comment.
  if (!fileName.startsWith(crosRoot)) {
    throw new Error(
      `Internal error: pathIsIgnored is called with a file path ${fileName} with non-matching CrOS repo ${crosRoot}.`
    );
  }

  if (driver.path.basename(fileName) === IGNORE_FILE) return true;

  let prefix = driver.path.dirname(fileName);
  while (prefix.startsWith(crosRoot)) {
    for (const wildcard of await getIgnoreWildcards(prefix, fileName, output)) {
      if (driver.matchGlob(fileName, wildcard)) {
        output?.appendLine(
          `Match pattern in ${prefix}/${IGNORE_FILE}, not formatting ${fileName}.`
        );
        return true;
      }
    }
    prefix = driver.path.dirname(prefix);
  }
  output?.appendLine(`${IGNORE_FILE} not found for ${fileName}`);
  return false;
}

/*
 * Get wildcards listed in a directory's IGNORE_FILE.
 *
 * Essentially a reimplementation of _get_ignore_wildcards in
 * https://source.corp.google.com/h/chromium/chromiumos/codesearch/+/main:src/repohooks/pre-upload.py?q=_get_ignore_wildcards
 * However, instead of comparing a non-permuted pattern with a truncated (target) file path, add
 * directory prefix to the pattern and compare with the (target's) real path.
 */
async function getIgnoreWildcards(
  directory: string,
  path: string,
  output?: vscode.OutputChannel
): Promise<string[]> {
  if (!IGNORED_WILDCARDS_CACHE.has(directory)) {
    const dotfilePath = driver.path.join(directory, IGNORE_FILE);
    if (await driver.fs.exists(dotfilePath)) {
      output?.appendLine(`Found ${dotfilePath} applicable to ${path}`);
      IGNORED_WILDCARDS_CACHE.set(
        directory,
        (await driver.fs.readFile(dotfilePath))
          .split('\n')
          // Ignore empty lines.
          .filter(line => line.length > 0)
          .map(line => line.trim())
          // Ignore comments.
          .filter(line => !line.startsWith('#'))
          // If it is a directory, add * to match everything in it.
          .map(line => (line.endsWith('/') ? line.concat('*') : line))
          // Prepend by directory path so that the pattern is relative to where the .presubmitignore
          // file is.
          .map(line => driver.path.join(directory, line))
      );
    }
  }
  return IGNORED_WILDCARDS_CACHE.get(directory) ?? [];
}
