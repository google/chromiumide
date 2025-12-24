// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/** Syntax restricted in our code. https://eslint.org/docs/latest/rules/no-restricted-syntax */
const COMMON_RESTRICTED_SYNTAX = [
  {
    selector: 'CallExpression[callee.name="Error"]',
    message:
      'Always use new Error() when instantiating exceptions, instead of just calling Error()',
  },
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
  {
    selector:
      'MemberExpression' +
      '[object.type="MemberExpression"]' +
      '[object.object.name="vscode"]' +
      '[object.property.name="workspace"]' +
      '[property.name="onDidChangeConfiguration"]',
    message:
      'vscode.workspace.onDidChangeConfiguration should not be called ' +
      'directly; use services/configs.ts instead',
  },
  {
    selector:
      'MemberExpression' +
      '[object.type="MemberExpression"]' +
      '[object.object.name="vscode"]' +
      '[object.property.name="commands"]' +
      '[property.name="registerCommand"]',
    message:
      'vscode.commands.registerCommand should not be called directly; ' +
      'use vscodeRegisterCommand instead',
  },
  {
    selector:
      'MemberExpression' +
      '[object.type="MemberExpression"]' +
      '[object.object.name="vscode"]' +
      '[object.property.name="commands"]' +
      '[property.name="registerTextEditorCommand"]',
    message:
      'vscode.commands.registerTextEditorCommand should not be called ' +
      'directly; use vscodeRegisterTextEditorCommand instead',
  },
  {
    /* eslint-disable no-restricted-syntax */
    selector:
      'Literal[value=/CrOs/], TemplateElement[value.raw=/CrOs/], Identifier[name=/CrOs/]',
    message: 'Use Cros (or CrOS for user facing texts) instead of CrOs',
  },
];

module.exports = {
  env: {
    browser: true,
    es2021: true,
  },
  extends: [
    './node_modules/gts/',
    'plugin:import/recommended',
    'plugin:import/typescript',
    'plugin:react-hooks/recommended',
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
        varsIgnorePattern: '^_',
      },
    ],

    // Disallow the unneeded public modifiers, as per the Google TypeScript
    // style guide.
    '@typescript-eslint/explicit-member-accessibility': [
      'error',
      {
        accessibility: 'no-public',
      },
    ],

    'import/first': 'error',
    'import/no-cycle': 'error',
    'import/order': [
      'error',
      {
        groups: ['builtin', 'external', 'parent', 'sibling', 'index', 'type'],
        'newlines-between': 'never',
        alphabetize: {
          order: 'asc',
          caseInsensitive: true,
        },
      },
    ],

    'no-restricted-syntax': ['error', ...COMMON_RESTRICTED_SYNTAX],
    // Disallow variables called `namespace`, because they mess up Gerrit's
    // syntax highlighting.
    'id-match': ['error', '^(?!(namespace)$)'],
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
        '@typescript-eslint/no-floating-promises': 'error',
        '@typescript-eslint/no-misused-promises': 'error',
        // unbound-method is not aware of expect(...), so we disable it in tests
        // (see overrides below).
        '@typescript-eslint/unbound-method': ['error', {ignoreStatic: true}],
        '@typescript-eslint/explicit-module-boundary-types': [
          'error',
          {allowArgumentsExplicitlyTypedAsAny: true},
        ],
      },
      overrides: [
        {
          files: ['shared/**/*.ts', 'src/**/*.ts'],
          parserOptions: {
            project: 'tsconfig.json',
          },
        },
        {
          files: ['server/**/*.ts'],
          parserOptions: {
            project: 'server/tsconfig.json',
          },
        },
        {
          files: ['tools/**/*.ts'],
          parserOptions: {
            project: 'tools/tsconfig.json',
          },
        },
        {
          files: ['views/src/**/*.ts'],
          parserOptions: {
            project: 'views/tsconfig.json',
          },
        },
        {
          files: ['*.test.ts'],
          rules: {
            '@typescript-eslint/unbound-method': 'off',
            'no-restricted-syntax': [
              'error',
              {
                selector: 'ImportDeclaration[source.value="assert"]',
                message: 'Use jasmine APIs such as expect instead of assert',
              },
              ...COMMON_RESTRICTED_SYNTAX,
            ],
          },
        },
      ],
    },
  ],
};
