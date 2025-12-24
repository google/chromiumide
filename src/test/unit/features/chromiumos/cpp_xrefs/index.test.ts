// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import 'jasmine';
import * as vscode from 'vscode';
import {CLANGD_EXTENSION} from '../../../../../common/cpp_xrefs/constants';
import {CppXrefs} from '../../../../../common/cpp_xrefs/cpp_xrefs';
import {
  ErrorDetails,
  ShouldGenerateResult,
} from '../../../../../common/cpp_xrefs/types';
import {ChromiumosCppXrefs} from '../../../../../features/chromiumos/cpp_xrefs';
import {ChrootService} from '../../../../../services/chromiumos';
import * as testing from '../../../../testing';
import {
  installVscodeDouble,
  installFakeConfigs,
} from '../../../../testing/doubles';
import * as fakes from '../../../../testing/fakes';
import {FakeStatusManager} from '../../../../testing/fakes';

describe('C++ xrefs', () => {
  const tempDir = testing.tempDir();
  const {vscodeSpy, vscodeEmitters} = installVscodeDouble();
  installFakeConfigs(vscodeSpy, vscodeEmitters);

  beforeEach(() => {
    vscodeSpy.window.createOutputChannel.and.returnValue(
      new fakes.VoidOutputChannel()
    );
    vscodeSpy.commands.registerCommand('clangd.restart', () => {});
  });

  const state = testing.cleanState(async () => {
    const statusManager = new FakeStatusManager();
    await testing.buildFakeChromeos(tempDir.path);
    const chrootService = ChrootService.maybeCreate(tempDir.path, false)!;
    const cppXrefs = new CppXrefs(statusManager);
    const chromiumosCppXrefs = new ChromiumosCppXrefs(chrootService, cppXrefs);

    return {
      cppXrefs,
      chromiumosCppXrefs,
    };
  });

  afterEach(() => {
    state.cppXrefs.dispose();
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

      state.chromiumosCppXrefs.registerExtraGeneratorFactoryForTesting(() => {
        return {
          name: 'fake',
          shouldGenerate: async () => tc.shouldGenerateResponse,
          generate: async () => {
            generateCalled = true;
          },
          dispose: () => {},
        };
      });

      const clangd = tc.hasClangd
        ? jasmine.createSpyObj<vscode.Extension<unknown>>('clangd', [
            'activate',
          ])
        : undefined;
      vscodeSpy.extensions.getExtension
        .withArgs(CLANGD_EXTENSION)
        .and.returnValue(clangd);

      const waiter = new Promise(resolve => {
        state.chromiumosCppXrefs.onDidMaybeGenerateForTesting(resolve);
      });

      // Fire event
      const document = {
        fileName: '/fake/a.cc',
      } as vscode.TextDocument;
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

  it('shows error on failure unless ignored', async () => {
    const buttonLabel = 'the button';
    let pushButton: string | undefined = undefined; // clicked button
    let errorKind = 'foo'; // thrown error kind
    let actionTriggeredCount = 0;

    // Set up
    vscodeSpy.window.createOutputChannel.and.returnValue(
      new fakes.VoidOutputChannel()
    );
    vscodeSpy.window.showErrorMessage.and.callFake(async () => pushButton);

    state.chromiumosCppXrefs.registerExtraGeneratorFactoryForTesting(() => {
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
    });

    const clangd = jasmine.createSpyObj<vscode.Extension<unknown>>('clangd', [
      'activate',
    ]);
    vscodeSpy.extensions.getExtension
      .withArgs(CLANGD_EXTENSION)
      .and.returnValue(clangd);

    const fireEvent = async () => {
      const waiter = new Promise(resolve => {
        state.chromiumosCppXrefs.onDidMaybeGenerateForTesting(resolve);
      });

      vscodeEmitters.workspace.onDidSaveTextDocument.fire({
        fileName: '/fake/a.cc',
      } as vscode.TextDocument);

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
