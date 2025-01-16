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
    const provider = new ChromiumTerminalLinkProvider(srcDir);

    function provideTerminalLinks(line: string): ChromiumTerminalLink[] {
      return provider.provideTerminalLinks(
        {
          terminal: undefined as unknown as vscode.Terminal, // not used
          line,
        },
        new fakes.FakeCancellationToken()
      );
    }

    expect(provideTerminalLinks('')).toEqual([]);
    expect(provideTerminalLinks('foo/bar.cc')).toEqual([]);
    expect(provideTerminalLinks('../../foo/bar.cc')).toEqual([
      new ChromiumTerminalLink(
        6,
        10,
        vscode.Uri.file(path.join(srcDir, 'foo/bar.cc')),
        undefined
      ),
    ]);
    expect(provideTerminalLinks('../../foo/bar.cc:10')).toEqual([
      new ChromiumTerminalLink(
        6,
        13,
        vscode.Uri.file(path.join(srcDir, 'foo/bar.cc')),
        new vscode.Position(9, 0)
      ),
    ]);
    expect(provideTerminalLinks('../../foo/bar.cc:10:20')).toEqual([
      new ChromiumTerminalLink(
        6,
        16,
        vscode.Uri.file(path.join(srcDir, 'foo/bar.cc')),
        new vscode.Position(9, 19)
      ),
    ]);
    expect(provideTerminalLinks('../../foo/bar.cc: file not found')).toEqual([
      new ChromiumTerminalLink(
        6,
        10,
        vscode.Uri.file(path.join(srcDir, 'foo/bar.cc')),
        undefined
      ),
    ]);
    expect(provideTerminalLinks('../../foo/bar.cc:10: EOF reached')).toEqual([
      new ChromiumTerminalLink(
        6,
        13,
        vscode.Uri.file(path.join(srcDir, 'foo/bar.cc')),
        new vscode.Position(9, 0)
      ),
    ]);
    expect(
      provideTerminalLinks('../../foo/bar.cc:10:20: syntax error')
    ).toEqual([
      new ChromiumTerminalLink(
        6,
        16,
        vscode.Uri.file(path.join(srcDir, 'foo/bar.cc')),
        new vscode.Position(9, 19)
      ),
    ]);
    expect(
      provideTerminalLinks('ERROR: ../../foo/bar.cc:10:20: syntax error')
    ).toEqual([
      new ChromiumTerminalLink(
        13,
        16,
        vscode.Uri.file(path.join(srcDir, 'foo/bar.cc')),
        new vscode.Position(9, 19)
      ),
    ]);
  });
});
