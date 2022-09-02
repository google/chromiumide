// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import 'jasmine';
import * as vscode from 'vscode';
import {CLANGD_EXTENSION} from '../../../../features/cpp_code_completion/constants';
import {CppCodeCompletion} from '../../../../features/cpp_code_completion/cpp_code_completion';
import {installVscodeDouble, installFakeConfigs} from '../../doubles';
import * as bgTaskStatus from '../../../../ui/bg_task_status';
import {ErrorDetails} from '../../../../features/cpp_code_completion/compdb_generator';
import * as testing from '../../../testing';
import * as fakes from '../../../testing/fakes';

describe('C++ code completion', () => {
  const {vscodeSpy, vscodeEmitters} = installVscodeDouble();
  installFakeConfigs(vscodeSpy, vscodeEmitters);

  let cppCodeCompletion: undefined | CppCodeCompletion = undefined;
  afterEach(() => {
    cppCodeCompletion!.dispose();
    cppCodeCompletion = undefined;
  });

  type TestCase = {
    // Inputs
    name: string;
    maybeGenerateResponse: boolean;
    hasClangd: boolean;
    fireSaveTextDocument?: boolean;
    fireChangeActiveTextEditor?: boolean;
    // Expectations
    wantGenerate: boolean;
  };

  const testCases: TestCase[] = [
    {
      name: 'generates on active editor change',
      maybeGenerateResponse: true,
      hasClangd: true,
      fireChangeActiveTextEditor: true,
      wantGenerate: true,
    },
    {
      name: 'generates on file save',
      maybeGenerateResponse: true,
      hasClangd: true,
      fireSaveTextDocument: true,
      wantGenerate: true,
    },
    {
      name: 'does not generate if shouldGenerate returns false',
      maybeGenerateResponse: false,
      hasClangd: true,
      fireChangeActiveTextEditor: true,
      wantGenerate: false,
    },
    {
      name: 'does not generate if clangd extension is not installed',
      maybeGenerateResponse: true,
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
              shouldGenerate: async () => tc.maybeGenerateResponse,
              generate: async () => {
                generateCalled = true;
              },
              dispose: () => {},
            };
          },
        ],
        new bgTaskStatus.TEST_ONLY.StatusManagerImpl()
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
            shouldGenerate: async () => true,
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
      new bgTaskStatus.TEST_ONLY.StatusManagerImpl()
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
