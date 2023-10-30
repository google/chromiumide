// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as path from 'path';
import * as vscode from 'vscode';
import {Platform2Gtest} from '../../../../features/chromiumos/platform2_gtest';
import * as services from '../../../../services';
import * as testing from '../../../testing';

function textDocument(fileName: string, content: string): vscode.TextDocument {
  return {
    fileName,
    uri: vscode.Uri.file(fileName),
    getText(_range?: vscode.Range) {
      return content;
    },
  } as vscode.TextDocument;
}

describe('Platform2Gtest', () => {
  const tempDir = testing.tempDir();

  const {vscodeEmitters} = testing.installVscodeDouble();

  const subscriptions: vscode.Disposable[] = [];
  afterEach(() => {
    vscode.Disposable.from(...subscriptions.reverse()).dispose();
    subscriptions.splice(0);
  });

  const state = testing.cleanState(async () => {
    const chromiumos = tempDir.path;
    await testing.buildFakeChroot(chromiumos);

    const sut = new Platform2Gtest(
      chromiumos,
      services.chromiumos.ChrootService.maybeCreate(chromiumos)!
    );
    subscriptions.push(sut);

    return {
      chromiumos,
      sut,
    };
  });

  it('creates test items for gtest files', async () => {
    const document = textDocument(
      path.join(state.chromiumos, 'src/platform2/foo_test.cc'),
      `TEST(foo, bar) {}
TEST(another, test) {}`
    );

    vscodeEmitters.workspace.onDidOpenTextDocument.fire(document);

    // TODO(oka): Consider waiting for an event from sut for robustness.
    await testing.flushMicrotasks();

    const controller = state.sut.getTestControllerForTesting();

    expect(controller.items.size).toEqual(1); // 1 file
    controller.items.forEach(item => {
      expect(item.children.size).toEqual(2); // 2 test cases
    });

    vscodeEmitters.workspace.onDidCloseTextDocument.fire(document);

    await testing.flushMicrotasks();

    expect(controller.items.size).toEqual(0);
  });

  const GTEST_CONTENT = 'TEST(foo, bar) {}';
  for (const [name, fileName, content, wantRegistered] of [
    [
      'handles platform2 gtest',
      'src/platform2/foo_test.cc',
      GTEST_CONTENT,
      true,
    ],
    [
      'does not handle gtest outside platform2',
      'chromite/foo_test.cc',
      GTEST_CONTENT,
      false,
    ],
    [
      'does not handle files without test suffix',
      'src/platform2/foo.cc',
      GTEST_CONTENT,
      false,
    ],
    [
      'does not handle files with no test cases',
      'src/platform2/foo_test.cc',
      'no test here',
      false,
    ],
  ] as [string, string, string, boolean][]) {
    it(name, async () => {
      vscodeEmitters.workspace.onDidOpenTextDocument.fire(
        textDocument(path.join(state.chromiumos, fileName), content)
      );

      await testing.flushMicrotasks();

      const registered = state.sut.getTestControllerForTesting().items.size > 0;
      expect(registered).withContext(fileName).toEqual(wantRegistered);
    });
  }
});
