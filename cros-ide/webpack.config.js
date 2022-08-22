// Copyright 2022 The ChromiumOS Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
//@ts-check

'use strict';

const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

//@ts-check
/** @typedef {import('webpack').Configuration} WebpackConfig **/

/** @type WebpackConfig */
const commonConfig = {
  // This leaves the source code as close as possible to the
  // original (when packaging we set this to "production").
  mode: 'none',

  resolve: {
    // Support reading TypeScript and JavaScript files.
    // https://github.com/TypeStrong/ts-loader
    extensions: ['.ts', '.js'],
  },

  devtool: 'nosources-source-map',
  infrastructureLogging: {
    // Enable logging required for problem matchers.
    level: 'log',
  },
};

/** @type WebpackConfig */
const extensionConfig = {
  ...commonConfig,

  // VSCode extensions run in a Node.js context.
  // https://webpack.js.org/configuration/node/
  target: 'node',

  // The entry point of this extension.
  // https://webpack.js.org/configuration/entry-context/
  entry: './src/extension.ts',
  output: {
    // The bundle is stored in the dist folder.
    // package.json specifies dist/extension.js as the extension entry point.
    // https://webpack.js.org/configuration/output/
    path: path.resolve(__dirname, 'dist'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2',
  },
  externals: {
    // The vscode module is created on-the-fly and must be excluded.
    // Add other modules that cannot be webpack'ed.
    // https://webpack.js.org/configuration/externals/
    // Modules added here also need to be added in the .vscodeignore file.
    vscode: 'commonjs vscode',
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader',
          },
        ],
      },
    ],
  },
};

/** @type WebpackConfig */
const viewsConfig = {
  ...commonConfig,

  // WebView scripts run in the web context.
  target: 'web',

  // Entry points.
  // https://webpack.js.org/configuration/entry-context/
  entry: {
    vnc: './views/src/vnc.ts',
    syslog: './views/src/syslog.ts',
  },
  output: {
    path: path.resolve(__dirname, 'dist', 'views'),
    filename: '[name].js',
    libraryTarget: 'commonjs2',
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              // Use tsconfig.json in the subdirectory.
              configFile: 'views/tsconfig.json',
            },
          },
        ],
      },
    ],
  },
  plugins: [
    new CopyPlugin({
      // This plugin copies views/static/* to dist/views/*.
      patterns: [{from: 'views/static', to: '.'}],
    }),
  ],
};

module.exports = [extensionConfig, viewsConfig];
