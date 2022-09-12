// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * safeRE matches an argument that can be literally included in a shell
 * command line without requiring escaping.
 *
 * The character class \w is equivalent to [0-9A-Za-z_]. Leading equals sign is unsafe in zsh,
 * see http://zsh.sourceforge.net/Doc/Release/Expansion.html#g_t_0060_003d_0027-expansion.
 */
const safeRE = /^[-\w@%+:,./][-\w@%+:,./=]*$/;

/**
 * Escape escapes a string so it can be safely included as an argument in a shell command line.
 * The string is not modified if it can already be safely included.
 */
export function escape(arg: string): string {
  if (safeRE.test(arg)) {
    return arg;
  }
  return "'" + arg.replace("'", "'\"'\"'") + "'";
}

/**
 * EscapeArray escapes an array of strings so each will be treated as a separate
 * argument in the returned shell command line. See Escape for more information.
 */
export function escapeArray(args: string[]): string {
  return args.map(escape).join(' ');
}
