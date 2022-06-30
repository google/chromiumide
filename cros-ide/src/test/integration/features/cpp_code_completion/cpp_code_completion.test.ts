// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import 'jasmine';
import * as path from 'path';
import * as vscode from 'vscode';
import * as commonUtil from '../../../../common/common_util';
import {WrapFs} from '../../../../common/cros';
import {CLANGD_EXTENSION} from '../../../../features/cpp_code_completion/constants';
import {CompilationDatabase} from '../../../../features/cpp_code_completion/cpp_code_completion';
import {Packages} from '../../../../features/cpp_code_completion/packages';
import {ChrootService} from '../../../../services/chroot';
import * as config from '../../../../services/config';
import * as bgTaskStatus from '../../../../ui/bg_task_status';
import {buildFakeChroot, cleanState, tempDir} from '../../../testing';
import {ConsoleOutputChannel} from '../../../testing/fakes';
import {installVscodeDouble, installFakeConfigs} from '../../doubles';
import {SpiedFakeCompdbService} from './spied_fake_compdb_service';

function newEventWaiter(
  compilationDatabase: CompilationDatabase
): Promise<void> {
  return new Promise(resolved => {
    compilationDatabase.onEventHandledForTesting.push(() =>
      resolved(undefined)
    );
  });
}

describe('C++ code completion', () => {
  const {vscodeSpy, vscodeEmitters} = installVscodeDouble();
  installFakeConfigs(vscodeSpy, vscodeEmitters);

  beforeEach(async () => {
    await config.board.update('amd64-generic');
  });

  const temp = tempDir();
  const state = cleanState(async () => {
    const osDir = temp.path;
    const chroot = await buildFakeChroot(osDir);
    const source = commonUtil.sourceDir(chroot);

    const spiedFakeCompdbService = new SpiedFakeCompdbService(source);
    // CompilationDatabase registers event handlers in the constructor.
    const compilationDatabase = new CompilationDatabase(
      new bgTaskStatus.TEST_ONLY.StatusManagerImpl(),
      new Packages(),
      new ConsoleOutputChannel(),
      spiedFakeCompdbService,
      new ChrootService(new WrapFs(chroot), new WrapFs(source))
    );
    return {
      source,
      spiedFakeCompdbService,
      compilationDatabase,
    };
  });
  afterEach(() => {
    state.compilationDatabase.dispose();
  });

  it('runs for platform2 C++ file', async () => {
    const clangd = jasmine.createSpyObj<vscode.Extension<unknown>>('clangd', [
      'activate',
    ]);
    vscodeSpy.extensions.getExtension
      .withArgs(CLANGD_EXTENSION)
      .and.returnValue(clangd);

    const done = newEventWaiter(state.compilationDatabase);

    vscodeEmitters.window.onDidChangeActiveTextEditor.fire({
      document: {
        fileName: path.join(state.source, 'src/platform2/cros-disks/foo.cc'),
        languageId: 'cpp',
      },
    } as vscode.TextEditor);

    await done;

    expect(clangd.activate).toHaveBeenCalledOnceWith();
    expect(state.spiedFakeCompdbService.requests).toEqual([
      {
        board: 'amd64-generic',
        packageInfo: {
          sourceDir: 'src/platform2/cros-disks',
          atom: 'chromeos-base/cros-disks',
        },
      },
    ]);
    expect(vscodeSpy.commands.executeCommand).toHaveBeenCalledOnceWith(
      'clangd.restart'
    );
  });

  it('runs for platform2 GN file', async () => {
    const clangd = jasmine.createSpyObj<vscode.Extension<unknown>>('clangd', [
      'activate',
    ]);
    vscodeSpy.extensions.getExtension
      .withArgs(CLANGD_EXTENSION)
      .and.returnValue(clangd);

    const done = newEventWaiter(state.compilationDatabase);

    vscodeEmitters.workspace.onDidSaveTextDocument.fire({
      fileName: path.join(state.source, 'src/platform2/cros-disks/BUILD.gn'),
      languageId: 'gn',
    } as vscode.TextDocument);

    await done;

    expect(clangd.activate).toHaveBeenCalledOnceWith();
    expect(state.spiedFakeCompdbService.requests).toEqual([
      {
        board: 'amd64-generic',
        packageInfo: {
          sourceDir: 'src/platform2/cros-disks',
          atom: 'chromeos-base/cros-disks',
        },
      },
    ]);
  });

  it('does not run on C++ file save', async () => {
    const clangd = jasmine.createSpyObj<vscode.Extension<unknown>>('clangd', [
      'activate',
    ]);
    vscodeSpy.extensions.getExtension
      .withArgs(CLANGD_EXTENSION)
      .and.returnValue(clangd);

    const done = newEventWaiter(state.compilationDatabase);

    vscodeEmitters.workspace.onDidSaveTextDocument.fire({
      fileName: path.join(state.source, 'src/platform2/cros-disks/foo.cc'),
      languageId: 'cpp',
    } as vscode.TextDocument);

    await done;

    expect(clangd.activate).not.toHaveBeenCalled();

    // The service should not have been called.
    expect(state.spiedFakeCompdbService.requests).toEqual([]);
  });

  it('does not run for C++ file if it has already run for the same package', async () => {
    const clangd = jasmine.createSpyObj<vscode.Extension<unknown>>('clangd', [
      'activate',
    ]);
    vscodeSpy.extensions.getExtension
      .withArgs(CLANGD_EXTENSION)
      .and.returnValue(clangd);

    let done = newEventWaiter(state.compilationDatabase);

    // A C++ file in the cros-disks project is opened.
    vscodeEmitters.window.onDidChangeActiveTextEditor.fire({
      document: {
        fileName: path.join(state.source, 'src/platform2/cros-disks/foo.cc'),
        languageId: 'cpp',
      },
    } as vscode.TextEditor);

    await done;

    // The service is called and generates compdb.
    expect(state.spiedFakeCompdbService.requests.length).toBe(1);

    done = newEventWaiter(state.compilationDatabase);

    // Another C++ file in the cros-disks project is opened.
    vscodeEmitters.window.onDidChangeActiveTextEditor.fire({
      document: {
        fileName: path.join(state.source, 'src/platform2/cros-disks/bar.cc'),
        languageId: 'cpp',
      },
    } as vscode.TextEditor);

    await done;

    // The service is not called because compdb has been already generated.
    expect(state.spiedFakeCompdbService.requests.length).toBe(1);

    done = newEventWaiter(state.compilationDatabase);

    // A C++ file in the codelab project is opened.
    vscodeEmitters.window.onDidChangeActiveTextEditor.fire({
      document: {
        fileName: path.join(state.source, 'src/platform2/codelab/baz.cc'),
        languageId: 'cpp',
      },
    } as vscode.TextEditor);

    await done;

    expect(clangd.activate).toHaveBeenCalledOnceWith();

    // The service is called because compdb has not been generated for codelab.
    expect(state.spiedFakeCompdbService.requests.length).toBe(2);
  });

  it('runs for C++ file if compilation database has been removed', async () => {
    const clangd = jasmine.createSpyObj<vscode.Extension<unknown>>('clangd', [
      'activate',
    ]);
    vscodeSpy.extensions.getExtension
      .withArgs(CLANGD_EXTENSION)
      .and.returnValue(clangd);

    let done = newEventWaiter(state.compilationDatabase);

    // A C++ file in the cros-disks project is opened.
    vscodeEmitters.window.onDidChangeActiveTextEditor.fire({
      document: {
        fileName: path.join(state.source, 'src/platform2/cros-disks/foo.cc'),
        languageId: 'cpp',
      },
    } as vscode.TextEditor);

    await done;

    // The service is called and generates compdb.
    expect(state.spiedFakeCompdbService.requests.length).toBe(1);

    // Remove the generated file.
    await fs.promises.rm(
      path.join(state.source, 'src/platform2/cros-disks/compile_commands.json')
    );

    done = newEventWaiter(state.compilationDatabase);

    // Another C++ file in the cros-disks project is opened.
    vscodeEmitters.window.onDidChangeActiveTextEditor.fire({
      document: {
        fileName: path.join(state.source, 'src/platform2/cros-disks/bar.cc'),
        languageId: 'cpp',
      },
    } as vscode.TextEditor);

    await done;

    // The service called because compdb has been removed.
    expect(state.spiedFakeCompdbService.requests.length).toBe(2);
  });

  it('does not run if clangd extension is not installed', async () => {
    const done = newEventWaiter(state.compilationDatabase);

    vscodeEmitters.window.onDidChangeActiveTextEditor.fire({
      document: {
        fileName: '/mnt/host/source/src/platform2/cros-disks/foo.cc',
        languageId: 'cpp',
      },
    } as vscode.TextEditor);

    await done;

    expect(state.spiedFakeCompdbService.requests).toEqual([]);
  });

  // TODO(oka): Test error handling.
  // * When compdb generation fails, it should show an error message with the
  //   next action to take.
  // * An error message is not popped up if the user already seen the error in
  //   this session.
});
