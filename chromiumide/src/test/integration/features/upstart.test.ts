// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import 'jasmine';
import * as vscode from 'vscode';
import {TEST_ONLY} from '../../../features/upstart';
import {FakeCancellationToken} from '../../testing/fakes';
import {closeDocument} from '../extension_testing';

const {UpstartSymbolProvider} = TEST_ONLY;

const UPSTART_SCRIPT = `
# Comment

description    "Service description"
author         "chromium-os-dev@chromium.org"

start on start-user-session

env CAMERA_LIBFS_DIR=/usr/share/cros-camera/libfs

env GRPC_POLL_STRATEGY=poll

pre-start script
  env USE=sth emerge
end script

env NO_VALUE
env NO_VALUE_EQ=
env BTMGMT_JAIL='/sbin/minijail0 -u bluetooth -g bluetooth -G -c 3500 -- /usr/bin/btmgmt'
env BT_ADDR_RE='^\\s*addr (([0-9A-F]){2}:){5}([0-9A-F]){2}\\s'
env drvfile=/var/lib/preload-network-drivers

script
  echo
end script

post-stop exec one --liner

exec multi\\
  line\\
  command

#more stuff
`;

describe('Upstart support', () => {
  let document: vscode.TextDocument;

  beforeAll(async () => {
    document = await vscode.workspace.openTextDocument({
      content: UPSTART_SCRIPT,
    });
  });

  afterAll(async () => {
    await closeDocument(document);
  });

  it('extracts symbols for env stanzas', () => {
    const provider = new UpstartSymbolProvider();
    const symbols = provider.provideDocumentSymbols(
      document,
      new FakeCancellationToken()
    );
    expect(symbols).toEqual([
      new vscode.DocumentSymbol(
        'CAMERA_LIBFS_DIR',
        '',
        vscode.SymbolKind.Variable,
        new vscode.Range(8, 0, 8, 49),
        new vscode.Range(8, 4, 8, 20)
      ),
      new vscode.DocumentSymbol(
        'GRPC_POLL_STRATEGY',
        '',
        vscode.SymbolKind.Variable,
        new vscode.Range(10, 0, 10, 27),
        new vscode.Range(10, 4, 10, 22)
      ),
      new vscode.DocumentSymbol(
        'NO_VALUE',
        '',
        vscode.SymbolKind.Variable,
        new vscode.Range(16, 0, 16, 12),
        new vscode.Range(16, 4, 16, 12)
      ),
      new vscode.DocumentSymbol(
        'NO_VALUE_EQ',
        '',
        vscode.SymbolKind.Variable,
        new vscode.Range(17, 0, 17, 16),
        new vscode.Range(17, 4, 17, 15)
      ),
      new vscode.DocumentSymbol(
        'BTMGMT_JAIL',
        '',
        vscode.SymbolKind.Variable,
        new vscode.Range(18, 0, 18, 89),
        new vscode.Range(18, 4, 18, 15)
      ),
      new vscode.DocumentSymbol(
        'BT_ADDR_RE',
        '',
        vscode.SymbolKind.Variable,
        new vscode.Range(19, 0, 19, 60), // note double backslashes
        new vscode.Range(19, 4, 19, 14)
      ),
      new vscode.DocumentSymbol(
        'drvfile',
        '',
        vscode.SymbolKind.Variable,
        new vscode.Range(20, 0, 20, 44),
        new vscode.Range(20, 4, 20, 11)
      ),
      new vscode.DocumentSymbol(
        'script',
        'pre-start',
        vscode.SymbolKind.Function,
        new vscode.Range(12, 0, 14, 10),
        new vscode.Range(12, 0, 12, 16)
      ),
      new vscode.DocumentSymbol(
        'script',
        '',
        vscode.SymbolKind.Function,
        new vscode.Range(22, 0, 24, 10),
        new vscode.Range(22, 0, 22, 6)
      ),
      new vscode.DocumentSymbol(
        'exec',
        'post-stop',
        vscode.SymbolKind.Function,
        new vscode.Range(26, 0, 26, 26),
        new vscode.Range(26, 0, 26, 14)
      ),
      new vscode.DocumentSymbol(
        'exec',
        '',
        vscode.SymbolKind.Function,
        new vscode.Range(28, 0, 30, 9),
        new vscode.Range(28, 0, 28, 4)
      ),
    ]);
  });
});
