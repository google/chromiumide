// Copyright 2025 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as path from 'path';
import * as vscode from 'vscode';
import {
  ChromiumTerminalLink,
  ChromiumTerminalLinkProvider,
} from '../../../../features/chromium/terminal_links';
import * as testing from '../../../testing';
import * as fakes from '../../../testing/fakes';

describe('Chromium terminal link provider', () => {
  const tempDir = testing.tempDir();

  it('finds links correctly', async () => {
    const srcDir = tempDir.path;
    await testing.putFiles(srcDir, {
      'foo/bar.ts': '',
    });

    const provider = new ChromiumTerminalLinkProvider(srcDir);

    const provideTerminalLinks = (line: string) =>
      provider.provideTerminalLinks(
        {
          terminal: undefined as unknown as vscode.Terminal, // not used
          line,
        },
        new fakes.FakeCancellationToken()
      );

    expect(await provideTerminalLinks('')).toEqual([]);
    expect(await provideTerminalLinks('foo/bar.cc')).toEqual([]);
    expect(await provideTerminalLinks('foo/gen/bar.cc')).toEqual([]);
    expect(await provideTerminalLinks('https://example.com')).toEqual([]);
    expect(await provideTerminalLinks('http://localhost:8080')).toEqual([]);
    expect(await provideTerminalLinks('../../foo/bar.cc')).toEqual([
      new ChromiumTerminalLink(
        6,
        10,
        vscode.Uri.file(path.join(srcDir, 'foo/bar.cc')),
        undefined
      ),
    ]);
    expect(await provideTerminalLinks('../../foo/bar.cc:10')).toEqual([
      new ChromiumTerminalLink(
        6,
        13,
        vscode.Uri.file(path.join(srcDir, 'foo/bar.cc')),
        new vscode.Position(9, 0)
      ),
    ]);
    expect(await provideTerminalLinks('../../foo/bar.cc:10:20')).toEqual([
      new ChromiumTerminalLink(
        6,
        16,
        vscode.Uri.file(path.join(srcDir, 'foo/bar.cc')),
        new vscode.Position(9, 19)
      ),
    ]);
    expect(
      await provideTerminalLinks('../../foo/bar.cc: file not found')
    ).toEqual([
      new ChromiumTerminalLink(
        6,
        10,
        vscode.Uri.file(path.join(srcDir, 'foo/bar.cc')),
        undefined
      ),
    ]);
    expect(
      await provideTerminalLinks('../../foo/bar.cc:10: EOF reached')
    ).toEqual([
      new ChromiumTerminalLink(
        6,
        13,
        vscode.Uri.file(path.join(srcDir, 'foo/bar.cc')),
        new vscode.Position(9, 0)
      ),
    ]);
    expect(
      await provideTerminalLinks('../../foo/bar.cc:10:20: syntax error')
    ).toEqual([
      new ChromiumTerminalLink(
        6,
        16,
        vscode.Uri.file(path.join(srcDir, 'foo/bar.cc')),
        new vscode.Position(9, 19)
      ),
    ]);
    expect(
      await provideTerminalLinks('ERROR: ../../foo/bar.cc:10:20: syntax error')
    ).toEqual([
      new ChromiumTerminalLink(
        13,
        16,
        vscode.Uri.file(path.join(srcDir, 'foo/bar.cc')),
        new vscode.Position(9, 19)
      ),
    ]);
    expect(
      await provideTerminalLinks(
        'ERROR at //foo/BUILD.gn:7:1: Assertion failed.'
      )
    ).toEqual([
      new ChromiumTerminalLink(
        11,
        16,
        vscode.Uri.file(path.join(srcDir, 'foo/BUILD.gn')),
        new vscode.Position(6, 0)
      ),
    ]);
    expect(await provideTerminalLinks('[//foo/bar](//foo/bar)')).toEqual([
      new ChromiumTerminalLink(
        3,
        7,
        vscode.Uri.file(path.join(srcDir, 'foo/bar')),
        undefined
      ),
      new ChromiumTerminalLink(
        14,
        7,
        vscode.Uri.file(path.join(srcDir, 'foo/bar')),
        undefined
      ),
    ]);
    expect(
      await provideTerminalLinks('gen/foo/bar.ts:117:11 - error TS2322: ...')
    ).toEqual([
      new ChromiumTerminalLink(
        4, // exclude "gen/"
        17,
        vscode.Uri.file(path.join(srcDir, 'foo/bar.ts')),
        new vscode.Position(116, 10)
      ),
    ]);
    expect(
      await provideTerminalLinks(
        'Building last failed targets: [gen/chrome/browser/resources/extensions/tsconfig_build_ts.json]...'
      )
    ).toEqual([
      new ChromiumTerminalLink(
        31, // include "gen/"
        62,
        vscode.Uri.file(
          path.join(
            srcDir,
            'out/current_link/gen/chrome/browser/resources/extensions/tsconfig_build_ts.json'
          )
        ),
        undefined
      ),
    ]);
    expect(
      await provideTerminalLinks('ACTION //foo/bar:build(//bar/baz:qux)')
    ).toEqual([
      new ChromiumTerminalLink(
        7,
        15,
        vscode.Uri.file(path.join(srcDir, 'foo/bar/BUILD.gn')),
        undefined
      ),
      new ChromiumTerminalLink(
        23,
        13,
        vscode.Uri.file(path.join(srcDir, 'bar/baz/BUILD.gn')),
        undefined
      ),
    ]);
  });
});
