// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {getDriver} from '../../../../../shared/app/common/driver_repository';
import {ExecResult} from '../../../../../shared/app/common/exec/types';
import {TEST_ONLY} from '../../../../../shared/app/features/cros_format';
import {
  StatusManager,
  TaskStatus,
} from '../../../../../shared/app/ui/bg_task_status';
import * as testing from '../../../testing';
import {
  FakeTextDocument,
  FakeWorkspaceConfiguration,
} from '../../../testing/fakes';

const {CrosFormat, pathIsIgnored, maybeSuggestSettingDefaultFormatter} =
  TEST_ONLY;
const driver = getDriver();

const formatterName = 'Google.cros-ide';

describe('Cros format', () => {
  const tempDir = testing.tempDir();
  const fakeExec = testing.installFakeExec();

  const state = testing.cleanState(async () => {
    const crosUri = vscode.Uri.file(
      driver.path.join(tempDir.path, 'src/some/file.md')
    );
    await testing.putFiles(tempDir.path, {
      // For driver.cros.findSourceDir to find the cros repo root (based on finding chroot).
      'chroot/etc/cros_chroot_version': 'fake chroot',
      // For crosExeFor to find the cros executable.
      'chromite/bin/cros': 'fakeCrosExe',
    });
    const statusManager = jasmine.createSpyObj<StatusManager>('statusManager', [
      'setStatus',
    ]);
    const crosFormat = new CrosFormat(
      statusManager,
      vscode.window.createOutputChannel('unused')
    );
    return {
      statusManager,
      crosFormat,
      crosUri,
    };
  });

  beforeEach(() => {
    spyOn(driver.metrics, 'send');
  });

  it('shows error when the command fails (execution error)', async () => {
    fakeExec.and.resolveTo(new Error());

    await state.crosFormat.provideDocumentFormattingEdits(
      new FakeTextDocument({uri: state.crosUri})
    );

    expect(state.statusManager.setStatus).toHaveBeenCalledOnceWith(
      'Formatter',
      TaskStatus.ERROR
    );
    expect(driver.metrics.send).toHaveBeenCalledOnceWith({
      category: 'error',
      group: 'format',
      name: 'cros_format_call_error',
      description: 'call to cros format failed',
    });
  });

  it('shows error when the command fails due to file syntax error', async () => {
    const execResult: ExecResult = {
      exitStatus: 65,
      stderr: 'stderr',
      stdout: 'stdout',
    };
    fakeExec.and.resolveTo(execResult);

    await state.crosFormat.provideDocumentFormattingEdits(
      new FakeTextDocument({uri: state.crosUri})
    );

    expect(state.statusManager.setStatus).toHaveBeenCalledOnceWith(
      'Formatter',
      TaskStatus.ERROR
    );
    expect(driver.metrics.send).toHaveBeenCalledOnceWith({
      category: 'error',
      group: 'format',
      name: 'cros_format_return_error',
      description: 'cros format returned syntax error',
    });
  });

  it('does not format code that is already formatted correctly', async () => {
    const execResult: ExecResult = {
      exitStatus: 0,
      stderr: '',
      stdout: '',
    };
    fakeExec.and.resolveTo(execResult);

    const edits = await state.crosFormat.provideDocumentFormattingEdits(
      new FakeTextDocument({uri: state.crosUri})
    );

    expect(edits).toBeUndefined();
    expect(state.statusManager.setStatus).toHaveBeenCalledOnceWith(
      'Formatter',
      TaskStatus.OK
    );
    expect(driver.metrics.send).not.toHaveBeenCalled();
  });

  it('formats code', async () => {
    const execResult: ExecResult = {
      exitStatus: 1,
      stderr: '',
      stdout: 'formatted\nfile',
    };
    fakeExec.and.resolveTo(execResult);

    const edits = await state.crosFormat.provideDocumentFormattingEdits(
      new FakeTextDocument({uri: state.crosUri})
    );

    expect(fakeExec).toHaveBeenCalled();
    expect(edits).toBeDefined();
    expect(state.statusManager.setStatus).toHaveBeenCalledOnceWith(
      'Formatter',
      TaskStatus.OK
    );
    expect(driver.metrics.send).toHaveBeenCalledOnceWith({
      category: 'background',
      group: 'format',
      name: 'cros_format',
      description: 'cros format',
    });
  });

  it('does not format files outside CrOS chroot', async () => {
    const edits = await state.crosFormat.provideDocumentFormattingEdits(
      new FakeTextDocument({uri: vscode.Uri.file('/not/a/cros/file.md')})
    );

    expect(fakeExec).not.toHaveBeenCalled();
    expect(edits).toBeUndefined();
    expect(driver.metrics.send).not.toHaveBeenCalled();
  });

  it('does not format files that are ignored', async () => {
    await testing.putFiles(tempDir.path, {
      'src/some/.presubmitignore': '*.md',
    });

    const edits = await state.crosFormat.provideDocumentFormattingEdits(
      new FakeTextDocument({uri: state.crosUri})
    );

    expect(fakeExec).not.toHaveBeenCalled();
    expect(edits).toBeUndefined();
    expect(driver.metrics.send).not.toHaveBeenCalled();
  });
});

describe('pathIsIgnored', () => {
  const tempDir = testing.tempDir();
  it('matches file with correct presubmit ignore pattern', async () => {
    const crosRoot = driver.path.join(tempDir.path, 'chromeos/');
    await testing.putFiles(tempDir.path, {
      '.presubmitignore': '**/*',
    });

    await testing.putFiles(crosRoot, {
      // For driver.cros.findSourceDir to find the cros repo root (based on finding chroot).
      'chroot/etc/cros_chroot_version': 'fake chroot',
      // For crosExeFor to find the cros executable.
      'chromite/bin/cros': 'fakeCrosExe',

      // .presubmitignore files in the fake CrOS repo.
      'src/.presubmitignore': `
**/*.h
`,
      'src/project/.presubmitignore': `
# *.js
foo.js
*.md
**/*.ts
subdir/*
subdir2/
`,
    });

    const testcases = [
      // Matches exact path (foo.js) in src/project/.presubmitignore.
      {path: 'src/project/foo.js', ignored: true},
      // Commented pattern should not be matched ('// *.js' in src/project/.presubmitignore).
      {path: 'src/project/bar.js', ignored: false},
      // Matches file pattern (*.md) in src/project/.presubmitignore.
      {path: 'src/project/foo.md', ignored: true},
      // Matches nested file pattern (**/*.ts) in src/project/.presubmitignore.
      {path: 'src/project/subdir/foo.ts', ignored: true},
      // Matches all file in subdir/ (subdir/*) in src/project/.presubmitignore.
      {path: 'src/project/subdir/foo', ignored: true},
      // Matches all file in subdir2/ (subdir2/) in src/project/.presubmitignore.
      {path: 'src/project/subdir2/foo', ignored: true},

      // Matches pattern from grandparent directory (**/*.h in src/.presubmitignore).
      {path: 'src/another_project/foo.h', ignored: true},
      // Matches with **.*.h in parent src/.presubmitignore, although it matches nothing i
      // src/project/.presubmitignore.
      {path: 'src/project/foo.h', ignored: true},

      // Matches with .presubmitignore along ancestor path but outside of the CrOS repo does not
      // count.
      {path: 'chromite/foo.ts', ignored: false},
    ];

    for (const {path, ignored} of testcases) {
      expect(await pathIsIgnored(driver.path.join(crosRoot, path), crosRoot))
        .withContext(`${path} should ${ignored ? '' : 'not '}be ignored`)
        .toBe(ignored);
    }
  });
});

describe('maybeSuggestSettingDefaultFormatter', () => {
  const {vscodeEmitters, vscodeSpy} = testing.installVscodeDouble();
  testing.installFakeConfigs(vscodeSpy, vscodeEmitters);
  const tempDir = testing.tempDir();

  const subscriptions: vscode.Disposable[] = [];
  testing.cleanState(async () => {
    await testing.buildFakeChroot(tempDir.path);
  });

  it('shows suggestion when config not set', async () => {
    const defaultFormatterConfig = FakeWorkspaceConfiguration.fromDefaults<
      string | null
    >('editor', new Map([['defaultFormatter', null]]), subscriptions);
    vscodeSpy.workspace.getConfiguration
      .withArgs('editor')
      .and.returnValue(defaultFormatterConfig);

    void maybeSuggestSettingDefaultFormatter(
      [
        {
          uri: vscode.Uri.file(tempDir.path),
        } as vscode.WorkspaceFolder,
      ],
      formatterName
    );
    expect(vscodeSpy.window.showInformationMessage).toHaveBeenCalledOnceWith(
      jasmine.stringContaining('default formatter'),
      jasmine.anything(),
      jasmine.anything(),
      jasmine.anything()
    );
  });

  it('shows suggestion when config is another formatter', () => {
    const defaultFormatterConfig = FakeWorkspaceConfiguration.fromDefaults<
      string | null
    >('editor', new Map([['defaultFormatter', 'prettier']]), subscriptions);
    vscodeSpy.workspace.getConfiguration
      .withArgs('editor')
      .and.returnValue(defaultFormatterConfig);

    void maybeSuggestSettingDefaultFormatter(
      [
        {
          uri: vscode.Uri.file(tempDir.path),
        } as vscode.WorkspaceFolder,
      ],
      formatterName
    );
    expect(vscodeSpy.window.showInformationMessage).toHaveBeenCalledOnceWith(
      jasmine.stringContaining('default formatter'),
      jasmine.anything(),
      jasmine.anything(),
      jasmine.anything()
    );
  });

  it('does not show suggestion when config is already set to the one by extension', () => {
    const defaultFormatterConfig = FakeWorkspaceConfiguration.fromDefaults<
      string | null
    >(
      'editor',
      new Map([['defaultFormatter', 'Google.cros-ide']]),
      subscriptions
    );
    vscodeSpy.workspace.getConfiguration
      .withArgs('editor')
      .and.returnValue(defaultFormatterConfig);

    void maybeSuggestSettingDefaultFormatter(
      [
        {
          uri: vscode.Uri.file(tempDir.path),
        } as vscode.WorkspaceFolder,
      ],
      formatterName
    );
    expect(vscodeSpy.window.showInformationMessage).not.toHaveBeenCalled();
  });

  it('updates workspace config value if user says yes', async () => {
    const editorConfig = FakeWorkspaceConfiguration.fromDefaults<string | null>(
      'editor',
      new Map([['defaultFormatter', 'prettier']]),
      subscriptions
    );
    vscodeSpy.workspace.getConfiguration
      .withArgs('editor')
      .and.returnValue(editorConfig);
    vscodeSpy.window.showInformationMessage
      .withArgs(
        jasmine.stringContaining('default formatter'),
        jasmine.anything(),
        jasmine.anything(),
        jasmine.anything()
      )
      .and.returnValue('Yes');

    await maybeSuggestSettingDefaultFormatter(
      [
        {
          uri: vscode.Uri.file(tempDir.path),
        } as vscode.WorkspaceFolder,
      ],
      formatterName
    );

    // Confirm default formatter is updated to the one provided by the extension.
    expect(editorConfig.get('defaultFormatter')).toEqual('Google.cros-ide');
  });

  it('updates workspace but not global suggestion config if user requests so', async () => {
    const editorConfig = FakeWorkspaceConfiguration.fromDefaults<string | null>(
      'editor',
      new Map([['defaultFormatter', 'prettier']]),
      subscriptions
    );
    const chromiumideConfig = FakeWorkspaceConfiguration.fromSection(
      'chromiumide',
      subscriptions
    );
    vscodeSpy.workspace.getConfiguration
      .withArgs('editor')
      .and.returnValue(editorConfig);
    vscodeSpy.workspace.getConfiguration
      .withArgs('chromiumide')
      .and.returnValue(chromiumideConfig);
    vscodeSpy.window.showInformationMessage
      .withArgs(
        jasmine.stringContaining('default formatter'),
        jasmine.anything(),
        jasmine.anything(),
        jasmine.anything()
      )
      .and.returnValue("Don't ask again in this workspace");

    await maybeSuggestSettingDefaultFormatter(
      [
        {
          uri: vscode.Uri.file(tempDir.path),
        } as vscode.WorkspaceFolder,
      ],
      formatterName
    );

    await maybeSuggestSettingDefaultFormatter(
      [
        {
          uri: vscode.Uri.file(tempDir.path),
        } as vscode.WorkspaceFolder,
      ],
      formatterName
    );

    // Users will not be prompted on the second time and default formatter remains unchanged.
    expect(vscodeSpy.window.showInformationMessage).toHaveBeenCalledTimes(1);
    expect(editorConfig.get('defaultFormatter')).toEqual('prettier');
    expect(chromiumideConfig.inspect('crosFormat.suggestSetAsDefault')).toEqual(
      jasmine.objectContaining({
        workspaceValue: false,
      })
    );
  });

  it('do not ask again ever if user requested', async () => {
    const editorConfig = FakeWorkspaceConfiguration.fromDefaults<string | null>(
      'editor',
      new Map([['defaultFormatter', 'prettier']]),
      subscriptions
    );
    const chromiumideConfig = FakeWorkspaceConfiguration.fromSection(
      'chromiumide',
      subscriptions
    );
    vscodeSpy.workspace.getConfiguration
      .withArgs('editor')
      .and.returnValue(editorConfig);
    vscodeSpy.workspace.getConfiguration
      .withArgs('chromiumide')
      .and.returnValue(chromiumideConfig);
    vscodeSpy.window.showInformationMessage
      .withArgs(
        jasmine.stringContaining('default formatter'),
        jasmine.anything(),
        jasmine.anything(),
        jasmine.anything()
      )
      .and.returnValue('Never ask again');

    await maybeSuggestSettingDefaultFormatter(
      [
        {
          uri: vscode.Uri.file(tempDir.path),
        } as vscode.WorkspaceFolder,
      ],
      formatterName
    );

    await maybeSuggestSettingDefaultFormatter(
      [
        {
          uri: vscode.Uri.file(tempDir.path),
        } as vscode.WorkspaceFolder,
      ],
      formatterName
    );

    // Users will not be prompted on the second time and default formatter remains unchanged.
    expect(vscodeSpy.window.showInformationMessage).toHaveBeenCalledTimes(1);
    expect(editorConfig.get('defaultFormatter')).toEqual('prettier');
    expect(chromiumideConfig.inspect('crosFormat.suggestSetAsDefault')).toEqual(
      jasmine.objectContaining({
        globalValue: false,
      })
    );
  });
});
