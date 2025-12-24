// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {runEbuildLsp} from './ebuild_lsp';

function main() {
  const opts = parseArgs();

  if (opts.lsp === 'ebuild') {
    runEbuildLsp();
  }
}

function parseArgs(): {
  lsp?: string;
} {
  const argv = process.argv.slice(2);

  const res: ReturnType<typeof parseArgs> = {};

  let i = 0;
  while (i < argv.length) {
    switch (argv[i++]) {
      case '--lsp':
        res.lsp = argv[i++];
        break;
    }
  }

  return res;
}

main();
