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

    'no-restricted-syntax': [
      'error',
      {
        selector:
          'MemberExpression' +
          '[object.type="MemberExpression"]' +
          '[object.object.name="vscode"]' +
          '[object.property.name="workspace"]' +
          '[property.name="getConfiguration"]',
        message:
          'vscode.workspace.getConfiguration should not be called directly; ' +
          'use services/configs.ts instead',
      },
    ],
  },
  settings: {
    'import/core-modules': ['vscode'],
  },

  // Enable TS-dependent rules only for *.ts files. Otherwise eslint gives
  // errors on linting *.js files, such as .eslintrc.js itself.
  overrides: [
    {
      files: ['*.ts'],
      parser: '@typescript-eslint/parser',
      rules: {
        // TODO(b/239106925): Make these rules error.
        '@typescript-eslint/no-floating-promises': 'warn',
        '@typescript-eslint/no-misused-promises': 'warn',
      },
      overrides: [
        {
          files: ['src/**/*.ts'],
          parserOptions: {
            project: 'tsconfig.json',
          },
        },
        {
          files: ['views/src/**/*.ts'],
          parserOptions: {
            project: 'views/tsconfig.json',
          },
        },
      ],
    },
  ],
};
