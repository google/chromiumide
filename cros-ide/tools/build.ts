// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Executable to build ChromiumIDE extension.

import {build, BuildOptions} from 'esbuild';

const VIEW_ENTRY_POINTS = {
  vnc: './views/src/vnc.ts',
  syslog_view: './views/src/features/device_management/syslog/view.tsx',
};

function commonOptions(production: boolean): BuildOptions {
  return {
    sourcemap: !production,
    target: 'es2020',
    minify: production,
    bundle: true,
  };
}

async function buildExtension(production: boolean) {
  const options: BuildOptions = {
    ...commonOptions(production),
    format: 'cjs',
    platform: 'node',
    outdir: './dist',
    external: ['vscode'],
    tsconfig: './tsconfig.json',
    entryPoints: {extension: './src/extension.ts'},
  };
  await build(options);
}

async function buildWebview(production: boolean) {
  // Bundle files
  const options: BuildOptions = {
    ...commonOptions(production),
    outdir: './dist/views',
    tsconfig: './views/tsconfig.json',
    entryPoints: VIEW_ENTRY_POINTS,
  };
  await build(options);
}

async function main() {
  const production = process.env.NODE_ENV === 'production';

  await Promise.all([buildExtension(production), buildWebview(production)]);
}

main().catch(e => {
  process.stderr.write(`${e}`);
  // eslint-disable-next-line no-process-exit
  process.exit(1);
});
