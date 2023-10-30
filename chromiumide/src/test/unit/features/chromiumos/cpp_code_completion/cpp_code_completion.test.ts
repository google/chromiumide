// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import 'jasmine';
import * as vscode from 'vscode';
import {
  ErrorDetails,
  ShouldGenerateResult,
} from '../../../../../features/chromiumos/cpp_code_completion/compdb_generator';
import {CLANGD_EXTENSION} from '../../../../../features/chromiumos/cpp_code_completion/constants';
import {CppCodeCompletion} from '../../../../../features/chromiumos/cpp_code_completion/cpp_code_completion';
import * as testing from '../../../../testing';
import {
  installVscodeDouble,
  installFakeConfigs,
} from '../../../../testing/doubles';
import * as fakes from '../../../../testing/fakes';
import {FakeStatusManager} from '../../../../testing/fakes';

describe('C++ code completion', () => {
  const {vscodeSpy, vscodeEmitters} = installVscodeDouble();
  installFakeConfigs(vscodeSpy, vscodeEmitters);

  beforeEach(() => {
    vscodeSpy.window.createOutputChannel.and.returnValue(
      new fakes.VoidOutputChannel()
    );
    vscodeSpy.commands.registerCommand('clangd.restart', () => {});
  });

  let cppCodeCompletion: undefined | CppCodeCompletion = undefined;
  afterEach(() => {
    cppCodeCompletion!.dispose();
    cppCodeCompletion = undefined;
  });

  type TestCase = {
    // Inputs
    name: string;
    shouldGenerateResponse: ShouldGenerateResult;
    hasClangd: boolean;
    fireSaveTextDocument?: boolean;
    fireChangeActiveTextEditor?: boolean;
    // Expectations
    wantGenerate: boolean;
  };

  const testCases: TestCase[] = [
    {
      name: 'generates on active editor change',
      shouldGenerateResponse: ShouldGenerateResult.Yes,
      hasClangd: true,
      fireChangeActiveTextEditor: true,
      wantGenerate: true,
    },
    {
      name: 'generates on file save',
      shouldGenerateResponse: ShouldGenerateResult.Yes,
      hasClangd: true,
      fireSaveTextDocument: true,
      wantGenerate: true,
    },
    {
      name: 'does not generate if shouldGenerate returns no',
      shouldGenerateResponse: ShouldGenerateResult.NoNeedNoChange,
      hasClangd: true,
      fireChangeActiveTextEditor: true,
      wantGenerate: false,
    },
    {
      name: 'does not generate if clangd extension is not installed',
      shouldGenerateResponse: ShouldGenerateResult.Yes,
      hasClangd: false,
      fireChangeActiveTextEditor: true,
      wantGenerate: false,
    },
  ];

  for (const tc of testCases) {
    it(tc.name, async () => {
      // Set up
      let generateCalled = false;
      cppCodeCompletion = new CppCodeCompletion(
        [
          () => {
            return {
              name: 'fake',
              shouldGenerate: async () => tc.shouldGenerateResponse,
              generate: async () => {
                generateCalled = true;
              },
              dispose: () => {},
            };
          },
        ],
        new FakeStatusManager()
      );

      const clangd = tc.hasClangd
        ? jasmine.createSpyObj<vscode.Extension<unknown>>('clangd', [
            'activate',
          ])
        : undefined;
      vscodeSpy.extensions.getExtension
        .withArgs(CLANGD_EXTENSION)
        .and.returnValue(clangd);

      const waiter = new Promise(resolve => {
        cppCodeCompletion!.onDidMaybeGenerate(resolve);
      });

      // Fire event
      const document = {} as vscode.TextDocument;
      if (tc.fireChangeActiveTextEditor) {
        vscodeEmitters.window.onDidChangeActiveTextEditor.fire({
          document,
        } as vscode.TextEditor);
      }
      if (tc.fireSaveTextDocument) {
        vscodeEmitters.workspace.onDidSaveTextDocument.fire(document);
      }

      await waiter;

      // Check
      if (tc.wantGenerate) {
        expect(generateCalled).toBeTrue();
        expect(clangd!.activate).toHaveBeenCalledOnceWith();
      } else {
        expect(generateCalled).toBeFalse();
        if (clangd) {
          expect(clangd.activate).not.toHaveBeenCalled();
        }
      }
    });
  }
});

describe('C++ code completion on failure', () => {
  const {vscodeSpy, vscodeEmitters} = installVscodeDouble();
  installFakeConfigs(vscodeSpy, vscodeEmitters);

  let cppCodeCompletion: undefined | CppCodeCompletion = undefined;
  afterEach(() => {
    cppCodeCompletion!.dispose();
    cppCodeCompletion = undefined;
  });

  it('shows error unless ignored', async () => {
    const buttonLabel = 'the button';
    let pushButton: string | undefined = undefined; // clicked button
    let errorKind = 'foo'; // thrown error kind
    let actionTriggeredCount = 0;

    // Set up
    vscodeSpy.window.createOutputChannel.and.returnValue(
      new fakes.VoidOutputChannel()
    );
    vscodeSpy.window.showErrorMessage.and.callFake(async () => pushButton);

    cppCodeCompletion = new CppCodeCompletion(
      [
        () => {
          return {
            name: 'fake',
            shouldGenerate: async () => ShouldGenerateResult.Yes,
            generate: async () => {
              throw new ErrorDetails(errorKind, 'error!', {
                label: buttonLabel,
                action: () => actionTriggeredCount++,
              });
            },
            dispose: () => {},
          };
        },
      ],
      new FakeStatusManager()
    );

    const clangd = jasmine.createSpyObj<vscode.Extension<unknown>>('clangd', [
      'activate',
    ]);
    vscodeSpy.extensions.getExtension
      .withArgs(CLANGD_EXTENSION)
      .and.returnValue(clangd);

    const fireEvent = async () => {
      const waiter = new Promise(resolve => {
        cppCodeCompletion!.onDidMaybeGenerate(resolve);
      });

      vscodeEmitters.workspace.onDidSaveTextDocument.fire(
        {} as vscode.TextDocument
      );

      await waiter;

      // User events are handled asynchronously.
      await testing.flushMicrotasks();
    };

    // Start testing
    pushButton = buttonLabel;

    await fireEvent();

    expect(actionTriggeredCount).toEqual(1);

    expect(vscodeSpy.window.showErrorMessage.calls.argsFor(0)).toEqual([
      'error!',
      buttonLabel,
      'Show Log',
      'Ignore',
    ]);

    await fireEvent();

    expect(actionTriggeredCount).toEqual(2);

    pushButton = 'Ignore';

    await fireEvent(); // ignore current error kind

    pushButton = buttonLabel;

    await fireEvent();

    expect(actionTriggeredCount).toEqual(2);

    errorKind = 'qux'; // new kind of error

    await fireEvent();

    expect(actionTriggeredCount).toEqual(3);
  });
});
