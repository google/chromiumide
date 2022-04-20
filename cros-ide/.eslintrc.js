// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

module.exports = {
  env: {
    browser: true,
    es2021: true,
  },
  extends: [
    './node_modules/gts/',
    'plugin:import/recommended',
    'plugin:import/typescript',
  ],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  rules: {
    // Latest Google TypeScript style guide does not mention column limits,
    // but just relies on the code formatter to do it nicely.
    // Thus disable the line width check in eslint.
    'max-len': 'off',

    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        vars: 'all',
        args: 'after-used',
        ignoreRestSiblings: false,
        argsIgnorePattern: '^_',
      },
    ],

    'import/first': 'error',
    'import/order': 'error',
  },
  settings: {
    'import/core-modules': ['vscode'],
  },
};
