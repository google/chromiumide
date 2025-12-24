// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import * as config from '../../../../../../shared/app/services/config';
import {CppXrefs} from '../../../../../common/cpp_xrefs/cpp_xrefs';
import {ChromiumosCppXrefs} from '../../../../../features/chromiumos/cpp_xrefs';
import {ChrootService} from '../../../../../services/chromiumos';
import * as testing from '../../../../testing';
import {FakeStatusManager} from '../../../../testing/fakes';

describe('Kernel C++ xrefs', () => {
  const tempDir = testing.tempDir();
  const {vscodeSpy, vscodeEmitters} = testing.installVscodeDouble();
  testing.installFakeConfigs(vscodeSpy, vscodeEmitters);

  beforeEach(() => {
    vscodeSpy.window.createOutputChannel.and.returnValue(
      new testing.fakes.VoidOutputChannel()
    );
    vscodeSpy.extensions.getExtension.and.returnValue({
      activate: () => Promise.resolve() as Thenable<void>,
    } as vscode.Extension<void>);
    vscodeSpy.commands.registerCommand('clangd.restart', () => {});
  });

  const fakeExec = testing.installFakeExec();

  const state = testing.cleanState(async () => {
    const chromiumosRoot = tempDir.path;
    await testing.buildFakeChromeos(chromiumosRoot);

    const chrootService = ChrootService.maybeCreate(chromiumosRoot, false)!;

    const statusManager = new FakeStatusManager();
    const cppXrefs = new CppXrefs(statusManager);
    const chromiumosCppXrefs = new ChromiumosCppXrefs(chrootService, cppXrefs);

    const maybeGenerateReader = new testing.EventReader(
      cppXrefs.onDidMaybeGenerate
    );

    return {
      chromiumosRoot,
      cppXrefs,
      chromiumosCppXrefs,
      maybeGenerateReader,
    };
  });

  afterEach(() => {
    state.maybeGenerateReader.dispose();
    state.cppXrefs.dispose();
  });

  for (const testCase of [
    {
      version: 'v5.10',
      wantPackage: 'sys-kernel/chromeos-kernel-5_10',
      wantChrootCompdb: 'build/kernel/compile_commands_no_chroot.json',
    },
    {
      version: 'upstream',
      wantPackage: 'sys-kernel/chromeos-kernel-upstream',
      wantChrootCompdb: 'build/kernel/compile_commands_no_chroot.json',
    },
    {
      version: 'v5.10-arcvm',
      wantPackage: 'sys-kernel/arcvm-kernel-ack-5_10',
      wantChrootCompdb:
        'var/cache/portage/sys-kernel/arcvm-kernel-ack-5_10/compile_commands_no_chroot.json',
    },
  ]) {
    it(`should generate compilation database on C++ file save (${testCase.version})`, async () => {
      const gitDir = path.join(
        state.chromiumosRoot,
        'src/third_party/kernel',
        testCase.version
      );
      await fs.promises.mkdir(path.join(gitDir, '.git'), {recursive: true});

      await config.board.update('brya');

      const chrootCompdb = path.join(
        state.chromiumosRoot,
        'out/build/brya',
        testCase.wantChrootCompdb
      );

      let emergeCallCount = 0;
      testing.fakes.installChrootCommandHandler(
        fakeExec,
        state.chromiumosRoot,
        'env',
        ['USE=compilation_database', 'emerge-brya', testCase.wantPackage],
        async () => {
          await fs.promises.mkdir(path.dirname(chrootCompdb), {
            recursive: true,
          });
          // HACK: `generate` compares the timestamp (ms) of the generated compdb if a file already
          // existed in the same location and returns an error if the timestamp didn't change,
          // thinking it was not updated. However in unit tests it's possible for the file to be
          // updated in a very quick succession unless we have the following line to ensure there to
          // be at least 1 ms difference.
          await new Promise(resolve => setTimeout(resolve, 2));

          await fs.promises.writeFile(chrootCompdb, '{}', 'utf8');
          emergeCallCount++;
          return '';
        }
      );

      const cppDocument = {
        languageId: 'cpp',
        fileName: path.join(gitDir, 'foo.cc'),
      } as vscode.TextDocument;

      vscodeEmitters.workspace.onDidSaveTextDocument.fire(cppDocument);

      await state.maybeGenerateReader.read();

      expect(emergeCallCount).toEqual(1);
      expect(
        await fs.promises.readFile(
          path.join(gitDir, 'compile_commands.json'),
          'utf8'
        )
      ).toEqual('{}');

      vscodeEmitters.workspace.onDidSaveTextDocument.fire(cppDocument);

      await state.maybeGenerateReader.read();
      expect(emergeCallCount).toEqual(1); // not called again after success

      await config.board.update('kukui');
      await config.board.update('brya');

      // Wait for the config change handler to finish. Assuming the handler just clears some states
      // without using `await`, this should work.
      await testing.flushMicrotasks();

      vscodeEmitters.workspace.onDidSaveTextDocument.fire(cppDocument);

      await state.maybeGenerateReader.read();
      expect(emergeCallCount).toEqual(2); // board change resets cached state
    });
  }

  type TestCase = {
    name: string;
    noBoard?: boolean;
    emergeError?: Error;
    noGenerateCompdb?: boolean;
    wantErrorMessage: jasmine.Expected<string>;
  };

  for (const testCase of [
    {
      name: 'should report if no default board was selected',
      noBoard: true,
      wantErrorMessage: jasmine.stringContaining('no board'),
    },
    {
      name: 'should report command failure',
      emergeError: new Error('<failed>'),
      wantErrorMessage: jasmine.stringContaining('<failed>'),
    },
    {
      name: 'should report if compdb not generated',
      noGenerateCompdb: true,
      wantErrorMessage: jasmine.stringMatching(
        new RegExp(
          'not generated .*out/build/brya/build/kernel/compile_commands_no_chroot.json'
        )
      ),
    },
  ] as TestCase[]) {
    it(testCase.name, async () => {
      const gitDir = path.join(
        state.chromiumosRoot,
        'src/third_party/kernel/v5.10'
      );
      await fs.promises.mkdir(path.join(gitDir, '.git'), {recursive: true});

      if (!testCase.noBoard) {
        await config.board.update('brya');
      }

      const chrootCompdb = path.join(
        state.chromiumosRoot,
        'out/build/brya/build/kernel/compile_commands.json'
      );

      testing.fakes.installChrootCommandHandler(
        fakeExec,
        state.chromiumosRoot,
        'env',
        [
          'USE=compilation_database',
          'emerge-brya',
          'sys-kernel/chromeos-kernel-5_10',
        ],
        async () => {
          if (testCase.emergeError) {
            return testCase.emergeError;
          }
          if (testCase.noGenerateCompdb) {
            await fs.promises.mkdir(path.dirname(chrootCompdb), {
              recursive: true,
            });
            await fs.promises.writeFile(chrootCompdb, '{}', 'utf8');
          }
          return '';
        }
      );

      vscodeSpy.window.showErrorMessage.and.resolveTo(undefined);

      vscodeEmitters.workspace.onDidSaveTextDocument.fire({
        languageId: 'cpp',
        fileName: path.join(gitDir, 'foo.cc'),
      } as vscode.TextDocument);

      await state.maybeGenerateReader.read();

      expect(vscodeSpy.window.showErrorMessage).toHaveBeenCalledOnceWith(
        testCase.wantErrorMessage,
        'Show Log',
        'Ignore'
      );
    });
  }
});
