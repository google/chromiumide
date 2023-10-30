// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Executable to build ChromiumIDE extension.

import {build, BuildOptions} from 'esbuild';
import {GitRevisionPlugin} from 'git-revision-webpack-plugin';
import glob from 'glob';
import webpack from 'webpack';
const CopyPlugin = require('copy-webpack-plugin');

const VIEW_ENTRY_POINTS = {
  vnc: './views/src/vnc.ts',
  syslog_view: './views/src/features/device_management/syslog/view.tsx',
};

function commonOptions(production: boolean): BuildOptions {
  return {
    sourcemap: !production,
    target: 'es2020',
    minify: production,
  };
}

async function buildExtension(production: boolean) {
  const options: BuildOptions = {
    ...commonOptions(production),
    bundle: true,
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
    bundle: true,
    outdir: './dist/views',
    tsconfig: './views/tsconfig.json',
    entryPoints: VIEW_ENTRY_POINTS,
  };
  await build(options);
}

/** Run plugins defined in webpack.config.js. */
async function runWebpack(production: boolean): Promise<void> {
  await new Promise((resolve, reject) => {
    const compiler = webpack({
      mode: production ? 'production' : 'development',
      // A fake entry point. We just want to execute plugins.
      entry: './empty.js',
      output: {
        filename: 'webpack_generated_empty_file.js',
        // The path is dist by default.
      },
    });

    new GitRevisionPlugin({
      versionCommand: 'describe --always --dirty',
    }).apply(compiler);

    // Copy files for views.
    new CopyPlugin({
      patterns: [
        // Copy webview static files to dist/views/.
        {from: 'views/static', to: 'views/'},
        // Copy @vscode/codicons's dist files to dist/views/vscode/.
        {
          from: 'node_modules/@vscode/codicons/dist/',
          to: 'views/vscode/',
        },
      ],
    }).apply(compiler);

    compiler.run((err, stats) => {
      if (err) {
        reject(err);
        return;
      }
      if (stats?.hasErrors()) {
        reject(new Error(stats.toString()));
      }
      resolve(0);
    });
  });
}

/**
 * Does the equivalent of `tsc -p . --outDir out` faster.
 */
async function buildTests() {
  const entryPoints = glob.sync('./src/**/*.ts');
  const options: BuildOptions = {
    ...commonOptions(/* production = */ false),
    format: 'cjs',
    platform: 'node',
    outbase: './src',
    outdir: './out',
    tsconfig: './tsconfig.json',
    entryPoints,
  };

  await build(options);
}

async function main() {
  const production = process.env.NODE_ENV === 'production';
  const test = process.env.NODE_ENV === 'test';

  const promises = [];

  if (test) {
    promises.push(buildTests());
  } else {
    promises.push(
      buildExtension(production),
      buildWebview(production),
      runWebpack(production)
    );
  }

  await Promise.all(promises);
}

main().catch(e => {
  process.stderr.write(`${e}\n`);
  // eslint-disable-next-line no-process-exit
  process.exit(1);
});
