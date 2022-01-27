// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

module.exports = {
  'env': {
    'browser': true,
    'es2021': true,
  },
  'extends': [
    'google',
  ],
  'parser': '@typescript-eslint/parser',
  'parserOptions': {
    'ecmaVersion': 'latest',
    'sourceType': 'module',
  },
  'plugins': [
    '@typescript-eslint',
  ],
  'rules': {
    // These rules should be enabled but are temporary disabled until the
    // violations are removed from the code.
    'require-jsdoc': 0,
    'max-len': 0,
    'camelcase': 0,
    'indent': 0,
    'semi': 0,
    'object-curly-spacing': 0,
    'arrow-parens': 0,
    'comma-dangle': 0,
    'quotes': 0,
    'no-throw-literal': 0,
    'prefer-const': 0,
    'no-unused-vars': 0,
    'padded-blocks': 0,
  },
};
