// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import 'jasmine';
import * as vscode from 'vscode';
import {CompilationDatabase} from '../../../features/cpp_code_completion/cpp_code_completion';
import {Packages} from '../../../features/cpp_code_completion/packages';
import * as bgTaskStatus from '../../../ui/bg_task_status';
import {cleanState, flushMicrotasks} from '../../testing';
import {installVscodeDouble} from '../doubles';
import {FakeOutputChannel} from '../fakes/output_channel';
import {fakeGetConfiguration} from '../fakes/workspace_configuration';
import {SpiedCompdbService} from './spied_compdb_service';

xdescribe('C++ code completion', () => {
  const {vscodeSpy, vscodeEmitters} = installVscodeDouble();

  const state = cleanState(() => {
    const spiedCompdbService = new SpiedCompdbService();
    // CompilationDatabase registers event handlers in the constructor.
    const compilationDatabase = new CompilationDatabase(
      new bgTaskStatus.TEST_ONLY.StatusManagerImpl(),
      new Packages(),
      new FakeOutputChannel(),
      spiedCompdbService
    );
    return {spiedCompdbService, compilationDatabase};
  });

  afterEach(() => {
    state.compilationDatabase.dispose();
  });

  it('runs for platform2 C++ file', async () => {
    vscodeSpy.workspace.getConfiguration.and.callFake(fakeGetConfiguration());
    vscode.workspace
      .getConfiguration('cros-ide')
      .update('board', 'amd64-generic');

    vscodeEmitters.window.onDidChangeActiveTextEditor.fire({
      document: {
        fileName: '/mnt/host/source/src/platform2/cros-disks/foo.cc',
        languageId: 'cpp',
      },
    } as vscode.TextEditor);

    await flushMicrotasks();

    expect(state.spiedCompdbService.requests).toEqual([
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
    vscodeSpy.workspace.getConfiguration.and.callFake(fakeGetConfiguration());
    vscode.workspace
      .getConfiguration('cros-ide')
      .update('board', 'amd64-generic');

    vscodeEmitters.workspace.onDidSaveTextDocument.fire({
      fileName: '/mnt/host/source/src/platform2/cros-disks/BUILD.gn',
      languageId: 'gn',
    } as vscode.TextDocument);

    await flushMicrotasks();

    expect(state.spiedCompdbService.requests).toEqual([
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
    vscodeSpy.workspace.getConfiguration.and.callFake(fakeGetConfiguration());
    vscode.workspace
      .getConfiguration('cros-ide')
      .update('board', 'amd64-generic');

    vscodeEmitters.workspace.onDidSaveTextDocument.fire({
      fileName: '/mnt/host/source/src/platform2/cros-disks/foo.cc',
      languageId: 'cpp',
    } as vscode.TextDocument);

    await flushMicrotasks();

    // The service should not have been called.
    expect(state.spiedCompdbService.requests).toEqual([]);
  });

  it('does not run for C++ file if it has already run for the same package', async () => {
    vscodeSpy.workspace.getConfiguration.and.callFake(fakeGetConfiguration());
    vscode.workspace
      .getConfiguration('cros-ide')
      .update('board', 'amd64-generic');

    // A C++ file in the cros-disks project is opened.
    vscodeEmitters.window.onDidChangeActiveTextEditor.fire({
      document: {
        fileName: '/mnt/host/source/src/platform2/cros-disks/foo.cc',
        languageId: 'cpp',
      },
    } as vscode.TextEditor);

    await flushMicrotasks();

    // The service is called and generates compdb.
    expect(state.spiedCompdbService.requests.length).toBe(1);

    // Another C++ file in the cros-disks project is opened.
    vscodeEmitters.window.onDidChangeActiveTextEditor.fire({
      document: {
        fileName: '/mnt/host/source/src/platform2/cros-disks/bar.cc',
        languageId: 'cpp',
      },
    } as vscode.TextEditor);

    await flushMicrotasks();

    // The service is not called because compdb has been already generated.
    expect(state.spiedCompdbService.requests.length).toBe(1);

    // A C++ file in the codelab project is opened.
    vscodeEmitters.window.onDidChangeActiveTextEditor.fire({
      document: {
        fileName: '/mnt/host/source/src/platform2/codelab/baz.cc',
        languageId: 'cpp',
      },
    } as vscode.TextEditor);

    await flushMicrotasks();

    // The service is called because compdb has not been generated for codelab.
    expect(state.spiedCompdbService.requests.length).toBe(2);
  });
});
