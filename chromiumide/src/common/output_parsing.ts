// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * Parses multi-line output, presumably from a CLI command, to find all key-value pairs, which are
 * [text]=[text]. This can be useful e.g. for `lsb-release` and `crosfleet dut lease output`.
 *
 * @param output The output, presumably from a CLI command.
 * @returns Record containing all keys and their values.
 */
export function parseMultilineKeyEqualsValue(
  output: string
): Record<string, string> {
  const entries = output
    .split(/\r?\n/)
    .map(line =>
      line
        .split(/=(.*)/s) // Split key/value on first =, but not successive =s
        .slice(0, 2)
        .map(kv => kv.trim())
    )
    .filter(kv => kv.length === 2); // Only include key/value output lines
  return Object.assign({}, ...entries.map(x => ({[x[0]]: x[1]})));
}
