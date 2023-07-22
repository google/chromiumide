// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
//@ts-check

'use strict';

const CopyPlugin = require('copy-webpack-plugin');
const {GitRevisionPlugin} = require('git-revision-webpack-plugin');

/**
 * @type {import('webpack').Configuration}
 */
const extensionConfig = {
  mode: 'production',

  // A fake entry point. We just want to execute plugins.
  entry: './empty.js',
  output: {
    filename: 'webpack_generated_empty_file.js',
    path: __dirname + '/dist',
  },

  plugins: [
    new GitRevisionPlugin({
      versionCommand: 'describe --always --dirty',
    }),

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
    }),
  ],
};

module.exports = [extensionConfig];
