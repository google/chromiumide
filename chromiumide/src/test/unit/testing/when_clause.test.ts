// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {evaluateWhenClause as evaluate} from '../../testing';

describe('evaluateWhenClause', () => {
  it('works on simple primitives', () => {
    expect(evaluate('true', {})).toBeTrue();
    expect(evaluate('false', {})).toBeFalse();
    expect(evaluate('!false', {})).toBeTrue();
    expect(evaluate('a == a', {a: 'a'})).toBeTrue();
    expect(evaluate('a == b', {a: 'a'})).toBeFalse();
    expect(evaluate('a == b', {a: 'b'})).toBeTrue();
    expect(evaluate('a =~ /^a$/', {a: 'a'})).toBeTrue();
    expect(evaluate('a =~ /^\\/\\/$/', {a: '//'})).toBeTrue();
    expect(evaluate('a =~ /\\\\/', {a: '\\'})).toBeTrue();
    expect(evaluate('(true)', {})).toBeTrue();
    expect(evaluate('true || false', {})).toBeTrue();
    expect(evaluate('false || true', {})).toBeTrue();
  });

  it('works on examples on official reference', () => {
    const context = {
      debuggersAvailable: true,
      inDebugMode: false,
      editorReadonly: false,
      textInputFocus: true,
      isLinux: true,
      isWindows: false,
      foo: false,
      bar: true,
      baz: true,
      editorLangId: 'typescript',
      resourceExtName: '.ts',
      resourceFilename: 'My New File.md',
      gitOpenRepositoryCount: 1,
      workspaceFolderCount: 1,
      resourceScheme: 'untitled',
      supportedFolders: ['My New File.md', 'other file'],
      explorerResourceIsFolder: true,
      'ext.supportedFolders': ['My New File.md'],
    };

    expect(evaluate('debuggersAvailable && !inDebugMode', context)).toBeTrue();
    expect(evaluate('!editorReadonly', context)).toBeTrue();
    expect(evaluate('!(editorReadonly || inDebugMode)', context)).toBeTrue();
    expect(evaluate('textInputFocus && !editorReadonly', context)).toBeTrue();
    expect(evaluate('isLinux || isWindows', context)).toBeTrue();
    expect(evaluate('!foo && bar', context)).toBeTrue();
    expect(evaluate('!foo || bar', context)).toBeTrue();
    expect(evaluate('foo || bar && baz', context)).toBeTrue();
    expect(evaluate('!foo && bar || baz', context)).toBeTrue();
    expect(evaluate('!(foo || bar) && baz', context)).toBeFalse();
    expect(evaluate('editorLangId == typescript', context)).toBeTrue();
    expect(evaluate("editorLangId == 'typescript'", context)).toBeTrue();
    expect(evaluate('resourceExtname != .js', context)).toBeTrue();
    expect(evaluate("resourceExtname != '.js'", context)).toBeTrue();
    expect(
      evaluate("resourceFilename == 'My New File.md'", context)
    ).toBeTrue();
    expect(evaluate('gitOpenRepositoryCount >= 1', context)).toBeTrue();
    expect(evaluate('workspaceFolderCount < 2', context)).toBeTrue();
    expect(
      evaluate('resourceScheme =~ /^untitled$|^file$/', context)
    ).toBeTrue();
    expect(evaluate('resourceFilename =~ /docker/', context)).toBeFalse();
    expect(
      evaluate('resourceFilename in supportedFolders', context)
    ).toBeTrue();
    expect(
      evaluate('resourceFilename not in supportedFolders', context)
    ).toBeFalse();
    expect(
      evaluate(
        'explorerResourceIsFolder && resourceFilename in ext.supportedFolders',
        context
      )
    ).toBeTrue();
  });
});
