// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

module.exports = {
  rules: {
    'no-restricted-syntax': [
      'error',
      {
        selector:
          'Literal[value=/\\bChromiumIDE\\b/], TemplateElement[value.raw=/\\bChromiumIDE\\b/]',
        message:
          'The extension name is ChromeOS on cider. Use extensionName() instead.',
      },
    ],
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['src/'],
            message:
              'Do not depend on //src. All functions should be provided through //shared/driver.',
          },
          {
            // List of nodejs libraries from https://github.com/nodejs/node/tree/main/lib.
            group: [
              '^assert$',
              '^async_hooks$',
              '^buffer$',
              '^child_process$',
              '^cluster$',
              '^console$',
              '^constants$',
              '^crypto$',
              '^dgram$',
              '^diagnostics_channel$',
              '^dns$',
              '^domain$',
              '^events$',
              '^fs$',
              '^http$',
              '^http2$',
              '^https$',
              '^inspector$',
              '^module$',
              '^net$',
              '^os$',
              '^path$',
              '^perf_hooks$',
              '^process$',
              '^punycode$',
              '^querystring$',
              '^readline$',
              '^repl$',
              '^sea$',
              '^stream$',
              '^string_decoder$',
              '^sys$',
              '^test$',
              '^timers$',
              '^tls$',
              '^trace_events$',
              '^tty$',
              '^url$',
              '^util$',
              '^v8$',
              '^vm$',
              '^wasi$',
              '^worker_threads$',
              '^zlib$',
            ],
            message:
              'Do not depend on nodejs library. Add the function in the //shared/driver interface and implement it in //src/driver instead. See go/chromiumide-on-cider-g-scaffolding.',
          },
        ],
      },
    ],
  },
};
