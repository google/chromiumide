// Copyright 2025 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {JniZeroCodeLensProvider} from '../../../../../features/chromium/java/jni_zero';
import {
  FakeCancellationToken,
  FakeTextDocument,
} from '../../../../testing/fakes';

describe('JNI Zero Code Lens provider', () => {
  const subscriptions: vscode.Disposable[] = [];

  afterEach(() => {
    for (const subscription of subscriptions.splice(0)) {
      subscription.dispose();
    }
  });

  it('parses JNI interfaces', async () => {
    const provider = new JniZeroCodeLensProvider();

    function parse(text: string): vscode.CodeLens[] {
      return provider.provideCodeLenses(
        new FakeTextDocument({
          uri: vscode.Uri.file('/tmp/A.java'),
          text,
        }),
        new FakeCancellationToken()
      );
    }

    expect(parse('')).toEqual([]);

    expect(
      parse(`
      public class A {
        @NativeMethods
        interface Jni {
          void init();
          int add(int a, int b);
        }
      }
    `)
    ).toEqual([
      new vscode.CodeLens(new vscode.Range(4, 10, 4, 22), {
        title: 'Go to JNI implementation',
        command: 'chromiumide.chromium.java.jniZero.gotoDefinition',
        tooltip: 'A::Init',
        arguments: ['A', 'Init'],
      }),
      new vscode.CodeLens(new vscode.Range(5, 10, 5, 32), {
        title: 'Go to JNI implementation',
        command: 'chromiumide.chromium.java.jniZero.gotoDefinition',
        tooltip: 'A::Add',
        arguments: ['A', 'Add'],
      }),
    ]);
  });
});
