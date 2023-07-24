// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Executable to build ChromiumIDE extension.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as babel from '@babel/core';
import {build, BuildOptions} from 'esbuild';
import glob from 'glob';
import * as commonUtil from '../src/common/common_util';

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
async function runWebpack(production: boolean) {
  const args = ['npx', 'webpack'];
  if (production) {
    args.push('--mode', 'produciton');
  }
  await commonUtil.execOrThrow(args[0], args.slice(1), {
    logger: {
      append(value) {
        process.stderr.write(value);
      },
    },
    logStdout: true,
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

  // HACK: transform following files so that they can use mock. It's a bug of tsc that exported
  // fields on modules are imported as mutable, which is fixed on esbuild, but we are currently
  // heavily relying on it. Transformation is done by first compiling the file to ES module via
  // esbuild and then transpiling it to CommonJS format via babel. There's no guarantee that the
  // transpilaiton works as we want in future version of the tools, but that's the same for tsc.
  // TODO: empty this allowlist.
  const mockableModules = [
    'features/gerrit/api/client',
    'features/gerrit/https',
    'test/unit/features/gerrit/fake_env',
  ];

  const tempDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'ide-build-tests-')
  );

  await build({
    ...options,
    format: 'esm',
    outdir: tempDir,
    entryPoints: mockableModules.map(x => `./src/${x}.ts`),
  });

  const transformPromises = [];

  for (const module of mockableModules) {
    const esmFile = `${tempDir}/${module}.js`;
    const cjsFile = `./out/${module}.js`;

    transformPromises.push(
      (async () => {
        const res = await babel.transformFileAsync(esmFile, {
          plugins: ['@babel/plugin-transform-modules-commonjs'],
        });
        const content = res!.code!;
        await fs.promises.mkdir(path.dirname(cjsFile), {recursive: true});
        await fs.promises.writeFile(cjsFile, content);
      })()
    );
  }

  await Promise.all(transformPromises);

  await fs.promises.rm(tempDir, {recursive: true});
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
  process.stderr.write(`${e}`);
  // eslint-disable-next-line no-process-exit
  process.exit(1);
});
