// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {promisify} from 'util';
import * as vscode from 'vscode';
import {
  EBUILD_DEFINED_VARIABLES_HOVER_STRING,
  EBUILD_PHASE_FUNCTIONS_HOVER_STRING,
  PORTAGE_PREDEFINED_READ_ONLY_VARIABLES_HOVER_STRING,
} from '../../../../../server/ebuild_lsp/shared/constants';
import {EbuildLspClient} from '../../../../features/chromiumos/ebuild/lsp_client';
import * as testing from '../../../testing';
import {ConsoleOutputChannel} from '../../../testing/fakes';
import {closeDocument} from '../../extension_testing';

describe('Ebuild LSP', () => {
  let chromiumosRoot = '';
  let ebuildLspClient: EbuildLspClient = {} as EbuildLspClient;

  beforeAll(async () => {
    chromiumosRoot = await promisify(fs.mkdtemp)(os.tmpdir() + '/');

    ebuildLspClient = new EbuildLspClient(
      testing.getExtensionUri(),
      chromiumosRoot,
      new ConsoleOutputChannel()
    );

    await ebuildLspClient.start();
  });

  afterAll(async () => {
    await ebuildLspClient.disposeAsync();

    await fs.promises.rm(chromiumosRoot, {recursive: true});
  });

  const asyncDisposes: (() => Promise<void>)[] = [];

  afterEach(async () => {
    for (const x of await fs.promises.readdir(chromiumosRoot)) {
      await fs.promises.rm(path.join(chromiumosRoot, x), {recursive: true});
    }

    for (const x of asyncDisposes.splice(0).reverse()) {
      await x();
    }
  });

  it('should support hover', async () => {
    const textDocument = await vscode.workspace.openTextDocument(
      testing.testdataUri('ebuild_lsp/fake_simple.ebuild')
    );
    asyncDisposes.push(() => closeDocument(textDocument));

    const hoverOn = async (p: vscode.Position) =>
      (await vscode.commands.executeCommand(
        'vscode.executeHoverProvider',
        textDocument.uri,
        p
      )) as vscode.Hover[];

    for (const {position, wantValue, wantRange} of [
      {
        position: new vscode.Position(1, 1), // Of EAPI
        wantValue: EBUILD_DEFINED_VARIABLES_HOVER_STRING('EAPI'),
        wantRange: new vscode.Range(1, 0, 1, 4),
      },
      {
        position: new vscode.Position(13, 8), // Of WORKDIR
        wantValue:
          PORTAGE_PREDEFINED_READ_ONLY_VARIABLES_HOVER_STRING('WORKDIR'),
        wantRange: new vscode.Range(13, 4, 13, 11),
      },
      {
        position: new vscode.Position(15, 5), // Of src_compile
        wantValue: EBUILD_PHASE_FUNCTIONS_HOVER_STRING('src_compile'),
        wantRange: new vscode.Range(15, 0, 15, 11),
      },
    ]) {
      const hover = await hoverOn(position);
      expect(hover[0]).toEqual(
        jasmine.objectContaining({
          contents: [
            jasmine.objectContaining({
              value: wantValue,
            }),
          ],
          range: wantRange,
        })
      );
    }
  });
});
