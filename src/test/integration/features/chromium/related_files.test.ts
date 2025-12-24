// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  CppRelatedFileCodeLens,
  CppRelatedFilesProvider,
} from '../../../../features/chromium/related_files/cpp';
import {PreprocessedFilesCodeLensProvider} from '../../../../features/chromium/related_files/preprocessed';
import * as testing from '../../../testing';
import {FakeCancellationToken, FakeTextDocument} from '../../../testing/fakes';
import * as extensionTesting from '../../extension_testing';

// Uses `CppRelatedFilesProvider` to resolve a `CppRelatedFileCodeLens`.
async function resolveLense(
  lense: InstanceType<typeof CppRelatedFileCodeLens>
) {
  expect(lense.command).toBeUndefined();
  expect(lense.isResolved).toBeFalse();
  const provider = new CppRelatedFilesProvider();
  await provider.resolveCodeLens(lense, new FakeCancellationToken());
}

describe('Related files on C++', () => {
  const tempDir = testing.tempDir();

  // Create a `vscode.TextDocument` from text and run `CppRelatedFilesProvider` on it.
  async function getLenses(fileName: string) {
    const document = await vscode.workspace.openTextDocument(
      vscode.Uri.joinPath(vscode.Uri.file(tempDir.path), fileName)
    );

    const provider = new CppRelatedFilesProvider();
    const lenses = await provider.provideCodeLenses(
      document,
      new FakeCancellationToken()
    );
    await extensionTesting.closeDocument(document);
    return {lenses, documentUri: document.uri};
  }

  function expectLenses(
    lenses: Array<InstanceType<typeof CppRelatedFileCodeLens>>,
    expected: Array<{title: string; filename: string}>
  ) {
    expect(lenses).toHaveSize(expected.length);
    for (let i = 0; i < lenses.length; ++i) {
      expect(lenses[i].range).toEqual(
        new vscode.Range(0, 0, 0, Number.MAX_SAFE_INTEGER)
      );
      expect(lenses[i].title).toBe(expected[i].title);
      expect(lenses[i].uri.fsPath).toBe(
        path.join(tempDir.path, expected[i].filename)
      );
    }
  }

  // This test exists because the `CppRelatedFilesProvider` currently has these file extensions
  // hard-coded. The provider could be changed to smartly infer the correct file extensions.
  it('ignores cpp files without .h or .cc endings', async () => {
    await testing.putFiles(tempDir.path, {'foo.cpp': ''});

    const {lenses} = await getLenses('foo.cpp');
    expect(lenses).toEqual([]);
  });

  it('creates the appropriate lenses for .h files', async () => {
    await testing.putFiles(tempDir.path, {'foo.h': ''});

    const {lenses} = await getLenses('foo.h');
    expectLenses(lenses, [
      {title: '.cc file', filename: 'foo.cc'},
      {title: 'unit test', filename: 'foo_unittest.cc'},
      {title: 'browser test', filename: 'foo_browsertest.cc'},
    ]);
  });

  it('creates the appropriate lenses for .cc files', async () => {
    await testing.putFiles(tempDir.path, {'foo.cc': ''});

    const {lenses} = await getLenses('foo.cc');
    expectLenses(lenses, [
      {title: '.h file', filename: 'foo.h'},
      {title: 'unit test', filename: 'foo_unittest.cc'},
      {title: 'browser test', filename: 'foo_browsertest.cc'},
    ]);
  });

  it('creates the appropriate lenses for unit test files', async () => {
    await testing.putFiles(tempDir.path, {'foo_unittest.cc': ''});

    const {lenses} = await getLenses('foo_unittest.cc');
    expectLenses(lenses, [
      {title: '.h file', filename: 'foo.h'},
      {title: '.cc file', filename: 'foo.cc'},
      {title: 'browser test', filename: 'foo_browsertest.cc'},
    ]);
  });

  it('creates the appropriate lenses for browser test files', async () => {
    await testing.putFiles(tempDir.path, {'foo_browsertest.cc': ''});

    const {lenses} = await getLenses('foo_browsertest.cc');
    expectLenses(lenses, [
      {title: '.h file', filename: 'foo.h'},
      {title: '.cc file', filename: 'foo.cc'},
      {title: 'unit test', filename: 'foo_unittest.cc'},
    ]);
  });

  it('resolves lense correctly if file does not exist', async () => {
    const uri = vscode.Uri.file(path.join(tempDir.path, 'foo_unittest.cc'));
    const lense = new CppRelatedFileCodeLens(
      new vscode.Range(0, 0, 0, Number.MAX_SAFE_INTEGER),
      'unit test',
      uri
    );
    await resolveLense(lense);
    expect(lense.command).toEqual({
      command: 'chromiumide.relatedFiles.create',
      title: 'Add unit test',
      arguments: [uri],
    });
  });

  it('resolves lense correctly if file exists', async () => {
    const uri = vscode.Uri.file(path.join(tempDir.path, 'foo_unittest.cc'));
    await testing.putFiles(tempDir.path, {'foo_unittest.cc': ''});
    const lense = new CppRelatedFileCodeLens(
      new vscode.Range(0, 0, 0, Number.MAX_SAFE_INTEGER),
      'unit test',
      uri
    );
    await resolveLense(lense);
    expect(lense.command).toEqual({
      command: 'vscode.open',
      title: 'Open unit test',
      arguments: [uri],
    });
  });

  it('does not give code lense on generated files', async () => {
    const selector = CppRelatedFilesProvider.documentSelector('/src');

    const cpp = (path: string) =>
      ({
        uri: vscode.Uri.file(path),
        languageId: 'cpp',
      } as vscode.TextDocument);

    expect(
      vscode.languages.match(selector, cpp('/src/chrome/foo.cc'))
    ).toBeTruthy();
    expect(
      vscode.languages.match(selector, cpp('/src/out/Debug/chrome/foo.cc'))
    ).toBeFalsy();
    expect(
      vscode.languages.match(selector, cpp('/outside/src/foo.cc'))
    ).toBeFalsy();
  });
});

describe('Related files on generated files', () => {
  it('matches preprocessed files', () => {
    const selector = PreprocessedFilesCodeLensProvider.documentSelector('/src');
    expect(
      vscode.languages.match(
        selector,
        new FakeTextDocument({
          uri: vscode.Uri.file(
            '/src/out/Debug/gen/chrome/browser/resources/extensions/preprocessed/service.ts'
          ),
        })
      )
    ).toBeTruthy();
    expect(
      vscode.languages.match(
        selector,
        new FakeTextDocument({
          uri: vscode.Uri.file('/src/out/Debug/gen/foo/bar.h'),
        })
      )
    ).toBeFalsy();
  });

  const srcDir = testing.tempDir();

  it('provides link to the original file', async () => {
    const provider = new PreprocessedFilesCodeLensProvider(srcDir.path);

    const orig = path.join(
      srcDir.path,
      'chrome/browser/resources/extensions/service.ts'
    );
    const generated = path.join(
      srcDir.path,
      'out/Debug/gen/chrome/browser/resources/extensions/preprocessed/service.ts'
    );

    await fs.promises.mkdir(path.dirname(orig), {recursive: true});
    await fs.promises.writeFile(orig, '');

    const lens = provider
      .provideCodeLenses(
        new FakeTextDocument({
          uri: vscode.Uri.file(generated),
        }),
        new FakeCancellationToken()
      )
      .map(lens => provider.resolveCodeLens(lens, new FakeCancellationToken()));

    expect(lens.length).toEqual(1);
    expect((await lens[0])!.command).toEqual({
      title: 'Open original file',
      command: 'vscode.open',
      arguments: [vscode.Uri.file(orig)],
    });
  });
});
