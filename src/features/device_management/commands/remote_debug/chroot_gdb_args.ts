// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * Creates arguments that instruct the gdb in chroot to read files in chroot for debugging.
 *
 * @param config The configuration of the executable to debug.
 * @param config.board The board name.
 * @param config.executablePath The path to the executable to debug. It should start with '/'.
 */
export function makeGdbArgsForLaunch(config: {
  board: string;
  executablePath: string;
}): string[] {
  return [
    '--init-eval-command',
    'set pagination off',
    '--init-eval-command',
    `file /build/${config.board}${config.executablePath}`,
    '--init-eval-command',
    `set debug-file-directory /build/${config.board}/usr/lib/debug`,
    '--init-eval-command',
    `set solib-absolute-prefix /build/${config.board}`,
    '--init-eval-command',
    `set solib-search-path /build/${config.board}`,
    '--init-eval-command',
    `set sysroot /build/${config.board}`,
    // TODO(b/227137453): Pretty-print libc++ containers.

    // TODO(b/227137453): Following args are copy of the args that should come from the debug
    // extension. Pass the args that actually come from the extension.
    '-q',
    '--interpreter=mi2',
  ];
}
