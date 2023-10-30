// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {TextEncoder} from 'util';
import * as vscode from 'vscode';
import * as boilerplate from '../../../features/boilerplate';
import * as config from '../../../services/config';
import {
  cleanState,
  installVscodeDouble,
  installFakeConfigs,
} from '../../testing';

describe('file boilerplate insertion', () => {
  const {vscodeSpy, vscodeEmitters, vscodeProperties} = installVscodeDouble();
  installFakeConfigs(vscodeSpy, vscodeEmitters);

  const state = cleanState(() => {
    const fs = jasmine.createSpyObj<vscode.FileSystem>('vscode.workspace.fs', {
      readDirectory: Promise.resolve([]),
      readFile: Promise.resolve(Buffer.from([])),
      createDirectory: Promise.resolve(),
    });
    vscodeProperties.workspace.fs = fs;

    return {fs};
  });

  beforeEach(async () => {
    jasmine.clock().install();
    jasmine.clock().mockDate();

    await config.boilerplate.guessNamespace.update(true);
  });

  afterEach(() => {
    jasmine.clock().uninstall();
  });

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
          uri: vscode.Uri.file('/root/foo'),
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
        uri: vscode.Uri.file('/cros/foo'),
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

  describe('Chromium-specific file boilerplate', () => {
    it('generates header guards', async () => {
      const generator = new boilerplate.ChromiumBoilerplateGenerator(
        '/chromium/src'
      );

      const got = await generator.getBoilerplate({
        languageId: 'cpp',
        lineCount: 0,
        fileName: '/chromium/src/chrome/browser/foo.h',
        uri: vscode.Uri.file('/chromium/src/chrome/browser/foo.h'),
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

    (['.cc', '.h'] as const).forEach(extension => {
      it(`generates namespaces for ${extension} files`, async () => {
        state.fs.readDirectory.and.resolveTo([['a.cc', vscode.FileType.File]]);
        state.fs.readFile.and.resolveTo(
          new TextEncoder().encode(`\
namespace cmfcmf {
  int x;
}`)
        );

        const generator = new boilerplate.ChromiumBoilerplateGenerator(
          '/chromium/src'
        );

        const got = await generator.getBoilerplate({
          languageId: 'cpp',
          lineCount: 0,
          fileName: '/chromium/src/chrome/browser/foo' + extension,
          uri: vscode.Uri.file('/chromium/src/chrome/browser/foo' + extension),
        } as vscode.TextDocument);
        if (extension === '.h') {
          expect(got).toEqual(`\
// Copyright ${new Date().getFullYear()} The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_FOO_H_
#define CHROME_BROWSER_FOO_H_

namespace cmfcmf {



}  // namespace cmfcmf

#endif  // CHROME_BROWSER_FOO_H_
`);
        } else {
          expect(got).toEqual(`\
// Copyright ${new Date().getFullYear()} The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/foo.h"

namespace cmfcmf {



}  // namespace cmfcmf
`);
        }
      });
    });

    [true, false]
      .flatMap(
        withNamespace =>
          [
            {withNamespace, fileName: 'foo.cc'},
            {withNamespace, fileName: 'foo_unittest.cc'},
            {withNamespace, fileName: 'foo_browsertest.cc'},
            {withNamespace, fileName: 'foo_test.cc'},
          ] as const
      )
      .forEach(({withNamespace, fileName}) => {
        it(`generates header include for cpp files while stripping test suffixes (${fileName})`, async () => {
          state.fs.readDirectory.and.resolveTo([
            ['a.cc', vscode.FileType.File],
          ]);
          state.fs.readFile.and.resolveTo(
            new TextEncoder().encode(`\
namespace cmfcmf {
int x;
}`)
          );

          await config.boilerplate.guessNamespace.update(withNamespace);

          const generator = new boilerplate.ChromiumBoilerplateGenerator(
            '/chromium/src'
          );

          const got = await generator.getBoilerplate({
            languageId: 'cpp',
            lineCount: 0,
            fileName: '/chromium/src/chrome/browser/' + fileName,
            uri: vscode.Uri.file('/chromium/src/chrome/browser/' + fileName),
          } as vscode.TextDocument);
          if (withNamespace && fileName === 'foo.cc') {
            expect(got).toEqual(`\
// Copyright ${new Date().getFullYear()} The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/foo.h"

namespace cmfcmf {



}  // namespace cmfcmf
`);
          } else if (withNamespace) {
            expect(got).toEqual(`\
// Copyright ${new Date().getFullYear()} The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/foo.h"

namespace cmfcmf {
namespace {



}  // namespace
}  // namespace cmfcmf
`);
          } else {
            expect(got).toEqual(`\
// Copyright ${new Date().getFullYear()} The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/foo.h"

`);
          }
        });
      });

    it('generates header include for Objective-C files', async () => {
      const generator = new boilerplate.ChromiumBoilerplateGenerator(
        '/chromium/src'
      );

      const got = await generator.getBoilerplate({
        languageId: 'cpp',
        lineCount: 0,
        fileName: '/chromium/src/chrome/browser/ios/foo.mm',
        uri: vscode.Uri.file('/chromium/src/chrome/browser/ios/foo.mm'),
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
        uri: vscode.Uri.file('/chromium/src/chrome/browser/foo.nc'),
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

  describe('boilerplate namespace guesser', () => {
    it('guesses no namespace for empty directories', async () => {
      const uri = vscode.Uri.file('/dir');

      state.fs.readDirectory.withArgs(uri).and.resolveTo([]);

      const nameSpace = await boilerplate.TEST_ONLY.guessNamespace(uri);
      expect(nameSpace).toBeNull();
    });

    it('only reads files in the same folder', async () => {
      const uri = vscode.Uri.file('/dir');

      state.fs.readDirectory.withArgs(uri).and.resolveTo([
        ['a.cc', vscode.FileType.File],
        ['b-folder', vscode.FileType.Directory],
        ['c-symlink-file', vscode.FileType.SymbolicLink | vscode.FileType.File],
        [
          'd-symlink-folder',
          vscode.FileType.SymbolicLink | vscode.FileType.Directory,
        ],
        // should not read from this file, only from `.h` and `.cc` files
        ['e.xyz', vscode.FileType.File],
      ]);
      state.fs.readFile
        .withArgs(vscode.Uri.joinPath(uri, 'a.cc'))
        .and.resolveTo(
          new TextEncoder().encode(`\
namespace cmfcmf {
int x;
}`)
        );

      const nameSpace = await boilerplate.TEST_ONLY.guessNamespace(uri);
      expect(nameSpace).toEqual('cmfcmf');
    });

    it('guesses the most common namespace from files in the same folder', async () => {
      const uri = vscode.Uri.file('/dir');

      state.fs.readDirectory.withArgs(uri).and.resolveTo([
        ['a.cc', vscode.FileType.File],
        ['b.h', vscode.FileType.File],
      ]);
      state.fs.readFile
        .withArgs(vscode.Uri.joinPath(uri, 'a.cc'))
        .and.resolveTo(
          new TextEncoder().encode(`\
namespace cmfcmf {
int x;
}
namespace cmfcmf {
int x;
}
namespace web::app {

}`)
        );
      state.fs.readFile.withArgs(vscode.Uri.joinPath(uri, 'b.h')).and.resolveTo(
        new TextEncoder().encode(`\
namespace another_namespace {
int x;
}
namespace web::app {

}
namespace web::app {

}`)
      );

      const nameSpace = await boilerplate.TEST_ONLY.guessNamespace(uri);
      expect(nameSpace).toEqual('web::app');
    });

    it('times out after 500ms', async () => {
      const uri = vscode.Uri.file('/dir');

      state.fs.readDirectory.withArgs(uri).and.resolveTo([
        ['a.cc', vscode.FileType.File],
        ['b.cc', vscode.FileType.File],
      ]);
      state.fs.readFile
        .withArgs(vscode.Uri.joinPath(uri, 'a.cc'))
        .and.callFake(async () => {
          // Pretend that reading this file takes 500ms.
          jasmine.clock().tick(500);
          return new TextEncoder().encode(`\
namespace cmfcmf {
int x;
}`);
        });
      state.fs.readFile
        .withArgs(vscode.Uri.joinPath(uri, 'b.cc'))
        .and.throwError('should not be called due to timeout');

      const nameSpace = await boilerplate.TEST_ONLY.guessNamespace(uri);
      expect(nameSpace).toEqual('cmfcmf');
    });
  });
});
