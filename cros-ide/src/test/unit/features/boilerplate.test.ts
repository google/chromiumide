// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as boilerplate from '../../../features/boilerplate';

describe('File boilerplate', () => {
  [
    {
      title: 'Chromium',
      generator: new boilerplate.ChromiumBoilerplateGenerator('/root'),
    },
    {
      title: 'ChromiumOS',
      generator: new boilerplate.ChromiumOSBoilerplateGenerator('/root'),
    },
  ].forEach(({generator, title}) => {
    for (const [languageId, wantHeader] of [
      ['cpp', new RegExp(`// Copyright \\d+ The ${title} Authors\n`)],
      ['python', new RegExp(`# Copyright \\d+ The ${title} Authors\n`)],
      ['unknown', undefined],
    ]) {
      it(`creates the right license headers for ${title} (language: ${languageId})`, async () => {
        const document = {
          languageId,
          lineCount: 1,
          fileName: '/root/foo',
        } as vscode.TextDocument;

        const got = await generator.getBoilerplate(document);
        if (wantHeader) {
          expect(generator.supportsDocument(document)).toBeTrue();
          expect(got).toMatch(wantHeader);
        } else {
          expect(generator.supportsDocument(document)).toBeFalse();
          expect(got).toBeNull();
        }
      });
    }

    it(`does not insert header for copied files for ${title}`, async () => {
      const got = generator.supportsDocument({
        languageId: 'cpp',
        lineCount: 123,
        fileName: '/cros/foo',
      } as vscode.TextDocument);

      expect(got).toBeFalse();
    });

    it(`does not insert header for files outside of ${title}`, async () => {
      const got = generator.supportsDocument({
        languageId: 'cpp',
        lineCount: 1,
        fileName: '/android/foo',
      } as vscode.TextDocument);

      expect(got).toBeFalse();
    });
  });
});

describe('Chromium-specific file boilerplate', () => {
  it('generates header guards', async () => {
    const generator = new boilerplate.ChromiumBoilerplateGenerator(
      '/chromium/src'
    );

    const got = await generator.getBoilerplate({
      languageId: 'cpp',
      lineCount: 0,
      fileName: '/chromium/src/chrome/browser/foo.h',
    } as vscode.TextDocument);
    expect(got).toEqual(`\
// Copyright ${new Date().getFullYear()} The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_FOO_H_
#define CHROME_BROWSER_FOO_H_



#endif  // CHROME_BROWSER_FOO_H_
`);
  });

  ['foo.cc', 'foo_unittest.cc', 'foo_browsertest.cc', 'foo_test.cc'].forEach(
    fileName => {
      it(`generates header include for cpp files while stripping test suffixes (${fileName})`, async () => {
        const generator = new boilerplate.ChromiumBoilerplateGenerator(
          '/chromium/src'
        );

        const got = await generator.getBoilerplate({
          languageId: 'cpp',
          lineCount: 0,
          fileName: '/chromium/src/chrome/browser/' + fileName,
        } as vscode.TextDocument);
        expect(got).toEqual(`\
// Copyright ${new Date().getFullYear()} The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/foo.h"

`);
      });
    }
  );

  it('generates header include for Objective-C files', async () => {
    const generator = new boilerplate.ChromiumBoilerplateGenerator(
      '/chromium/src'
    );

    const got = await generator.getBoilerplate({
      languageId: 'cpp',
      lineCount: 0,
      fileName: '/chromium/src/chrome/browser/ios/foo.mm',
    } as vscode.TextDocument);
    expect(got).toEqual(`\
// Copyright ${new Date().getFullYear()} The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#import "chrome/browser/ios/foo.h"

`);
  });

  it('generates no-compile lines for .nc files', async () => {
    const generator = new boilerplate.ChromiumBoilerplateGenerator(
      '/chromium/src'
    );

    const got = await generator.getBoilerplate({
      languageId: 'cpp',
      lineCount: 0,
      fileName: '/chromium/src/chrome/browser/foo.nc',
    } as vscode.TextDocument);
    expect(got).toEqual(`\
// Copyright ${new Date().getFullYear()} The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// This is a "No Compile Test" suite.
// https://dev.chromium.org/developers/testing/no-compile-tests

#include "chrome/browser/foo.h"

`);
  });
});
