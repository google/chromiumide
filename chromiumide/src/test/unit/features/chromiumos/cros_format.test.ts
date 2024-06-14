// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as vscode from 'vscode';
import {getDriver} from '../../../../../shared/app/common/driver_repository';
import {ExecResult} from '../../../../../shared/app/common/exec/types';
import {CrosFormatFeature} from '../../../../../shared/app/features/cros_format';
import {maybeConfigureOrSuggestSettingDefaultFormatter} from '../../../../../shared/app/features/cros_format/default_formatter';
import {isPresubmitignored} from '../../../../../shared/app/features/cros_format/presubmitignore';
import * as config from '../../../../../shared/app/services/config';
import {TaskStatus} from '../../../../../shared/app/ui/bg_task_status';
import * as testing from '../../../testing';
import {
  FakeTextDocument,
  FakeWorkspaceConfiguration,
  FakeTextEditor,
  FakeStatusManager,
} from '../../../testing/fakes';

const driver = getDriver();

const extensionId = 'Google.cros-ide';

describe('Cros format feature', () => {
  const tempDir = testing.tempDir();
  const fakeExec = testing.installFakeExec();
  const {vscodeSpy, vscodeEmitters, vscodeGetters} =
    testing.installVscodeDouble();
  testing.installFakeConfigs(vscodeSpy, vscodeEmitters);

  const state = testing.cleanState(async () => {
    vscodeSpy.window.createOutputChannel.and.returnValue(
      new testing.fakes.VoidOutputChannel()
    );

    const statusManager = new FakeStatusManager();

    let editProvider = {} as vscode.DocumentFormattingEditProvider;
    vscodeSpy.languages.registerDocumentFormattingEditProvider.and.callFake(
      (_selector, provider) => {
        editProvider = provider;
        return vscode.Disposable.from();
      }
    );

    const crosFormatFeature = new CrosFormatFeature(extensionId, statusManager);
    const subscriptions: vscode.Disposable[] = [crosFormatFeature];

    const onDidHandleEvent = new testing.EventReader(
      crosFormatFeature.onDidHandleEvent
    );
    subscriptions.push(onDidHandleEvent);

    const source = new vscode.CancellationTokenSource();
    subscriptions.push(source);

    const format = (document: vscode.TextDocument) =>
      editProvider.provideDocumentFormattingEdits(
        document,
        {
          insertSpaces: true,
          tabSize: 2,
        },
        source.token
      );

    const crosRoot = driver.path.join(tempDir.path, 'os');
    await testing.buildFakeChromeos(crosRoot);
    await testing.putFiles(crosRoot, {
      'src/platform2/.git/config': '',
    });

    const crosFile = (subpath: string) =>
      vscode.Uri.file(driver.path.join(crosRoot, subpath));

    return {
      crosRoot,
      onDidHandleEvent,
      format,
      statusManager,
      crosFile,
      subscriptions,
    };
  });

  beforeEach(() => {
    spyOn(driver.metrics, 'send');
  });

  afterEach(() => {
    vscode.Disposable.from(...state.subscriptions.reverse()).dispose();
  });

  it('shows error when the command fails (execution error)', async () => {
    await fs.promises.writeFile(
      state.crosFile('src/platform2/PRESUBMIT.cfg').fsPath,
      '[Hook Scripts]\ncros format = cros format --check --commit ${PRESUBMIT_COMMIT} ${PRESUBMIT_FILES}\n'
    );

    fakeExec.and.resolveTo(new Error());

    await state.format(
      new FakeTextDocument({uri: state.crosFile('src/platform2/foo.c')})
    );

    expect(state.statusManager.getStatus('Formatter')).toEqual(
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
    await fs.promises.writeFile(
      state.crosFile('src/platform2/PRESUBMIT.cfg').fsPath,
      '[Hook Scripts]\ncros format = cros format --check --commit ${PRESUBMIT_COMMIT} ${PRESUBMIT_FILES}\n'
    );

    const execResult: ExecResult = {
      exitStatus: 65,
      stderr: 'stderr',
      stdout: 'stdout',
    };
    fakeExec.and.resolveTo(execResult);

    await state.format(
      new FakeTextDocument({uri: state.crosFile('src/platform2/foo.c')})
    );

    expect(state.statusManager.getStatus('Formatter')).toEqual(
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
    await fs.promises.writeFile(
      state.crosFile('src/platform2/PRESUBMIT.cfg').fsPath,
      '[Hook Scripts]\ncros format = cros format --check --commit ${PRESUBMIT_COMMIT} ${PRESUBMIT_FILES}\n'
    );

    const execResult: ExecResult = {
      exitStatus: 0,
      stderr: '',
      stdout: '',
    };
    fakeExec.and.resolveTo(execResult);

    const edits = await state.format(
      new FakeTextDocument({uri: state.crosFile('src/platform2/foo.c')})
    );

    expect(edits).toBeUndefined();
    expect(state.statusManager.getStatus('Formatter')).toEqual(TaskStatus.OK);
    expect(driver.metrics.send).not.toHaveBeenCalled();
  });

  it('formats code', async () => {
    await fs.promises.writeFile(
      state.crosFile('src/platform2/PRESUBMIT.cfg').fsPath,
      '[Hook Scripts]\ncros format = cros format --check --commit ${PRESUBMIT_COMMIT} ${PRESUBMIT_FILES}\n'
    );

    const execResult: ExecResult = {
      exitStatus: 1,
      stderr: '',
      stdout: 'formatted\nfile',
    };
    fakeExec.and.resolveTo(execResult);

    const edits = await state.format(
      new FakeTextDocument({uri: state.crosFile('src/platform2/foo.c')})
    );

    expect(fakeExec).toHaveBeenCalled();
    expect(edits).toBeDefined();
    expect(state.statusManager.getStatus('Formatter')).toEqual(TaskStatus.OK);
    expect(driver.metrics.send).toHaveBeenCalledOnceWith({
      category: 'background',
      group: 'format',
      name: 'cros_format',
      description: 'cros format',
    });
  });

  it('does not format files outside CrOS', async () => {
    await fs.promises.writeFile(
      state.crosFile('src/platform2/PRESUBMIT.cfg').fsPath,
      '[Hook Scripts]\ncros format = cros format --check --commit ${PRESUBMIT_COMMIT} ${PRESUBMIT_FILES}\n'
    );

    const edits = await state.format(
      new FakeTextDocument({
        uri: vscode.Uri.file(driver.path.join(tempDir.path, 'foo.c')),
      })
    );

    expect(fakeExec).not.toHaveBeenCalled();
    expect(edits).toBeUndefined();
    expect(driver.metrics.send).not.toHaveBeenCalled();
  });

  it("does nothing if PRESUBMIT.cfg does not exist in the file's git repo", async () => {
    const file = state.crosFile('src/platform2/foo/foo.c');

    // Put PRESUBMIT.cfg in the file's parent git repo but that should not be used.
    const content = `[Hook Scripts]
cros format = cros format --check --commit \${PRESUBMIT_COMMIT} --include '*.proto' --include 'OWNERS*' --exclude '*' \${PRESUBMIT_FILES}
`;
    await testing.putFiles(state.crosRoot, {
      'src/platform2/.git/config': '',
      'src/platform2/PRESUBMIT.cfg': content,
      'src/platform2/foo/.git/config': '',
    });
    const edits = await state.format(new FakeTextDocument({uri: file}));
    expect(edits).toBeUndefined();
  });

  it('does not format files that are in .presubmitignore', async () => {
    await fs.promises.writeFile(
      state.crosFile('src/platform2/PRESUBMIT.cfg').fsPath,
      '[Hook Scripts]\ncros format = cros format --check --commit ${PRESUBMIT_COMMIT} ${PRESUBMIT_FILES}\n'
    );

    await testing.putFiles(state.crosRoot, {
      'src/platform2/.presubmitignore': '*.c',
    });

    const edits = await state.format(
      new FakeTextDocument({uri: state.crosFile('src/platform2/foo.c')})
    );

    expect(fakeExec).not.toHaveBeenCalled();
    expect(edits).toBeUndefined();
    expect(driver.metrics.send).not.toHaveBeenCalled();
  });

  it('force format when instructed so', async () => {
    await fs.promises.writeFile(
      state.crosFile('src/platform2/PRESUBMIT.cfg').fsPath,
      '[Hook Scripts]\ncros format = cros format --check --commit ${PRESUBMIT_COMMIT} ${PRESUBMIT_FILES}\n'
    );

    await testing.putFiles(state.crosRoot, {
      'src/.presubmitignore': '*.c',
    });

    const textEditor = new FakeTextEditor(
      new FakeTextDocument({
        uri: state.crosFile('src/platform2/foo.c'),
        text: 'before fmt',
      })
    );

    fakeExec.and.resolveTo({
      exitStatus: 1,
      stderr: '',
      stdout: 'after fmt',
    });

    vscodeGetters.window.activeTextEditor.and.returnValue(textEditor);
    await vscode.commands.executeCommand('chromiumide.crosFormat.forceFormat');
    await state.onDidHandleEvent.read();

    expect(textEditor.document.text).toEqual('after fmt');
  });

  for (const {name, content, wantOptions} of [
    {
      name: 'constructs correct command from an empty PRESUBMIT.cfg',
      content: '',
      wantOptions: undefined,
    },
    {
      name: 'constructs correct command from a multi-line PRESUBMIT.cfg with other commands',
      // Taken from chromite.
      content: `[Hook Scripts]
cros format = bin/cros format --check --commit \${PRESUBMIT_COMMIT} \${PRESUBMIT_FILES}
cros lint = bin/cros lint --commit \${PRESUBMIT_COMMIT} \${PRESUBMIT_FILES}
preupload_dump_config = bin/preupload_dump_config

[Hook Overrides]
git_cl_presubmit: false
project_prefix_check: true
`,
      wantOptions: ['--stdout'],
    },
    {
      name: 'constructs correct command from PRESUBMIT.cfg with extra options come after --commit',
      // Taken from infra/recipes, trimmed for brevity.
      content: `[Hook Scripts]
cros format = cros format --check --commit \${PRESUBMIT_COMMIT} --include '*.proto' --include 'OWNERS*' --exclude '*' \${PRESUBMIT_FILES}
`,
      wantOptions: [
        '--include',
        '*.proto',
        '--include',
        'OWNERS*',
        '--exclude',
        '*',
        '--stdout',
      ],
    },
    {
      name: 'constructs correct command from PRESUBMIT.cfg with extra options come before --commit',
      // Taken from third_party/webrtc-apm, trimmed for brevity.
      content: `[Hook Scripts]
cros format: cros format --include=webrtc_apm/* --exclude=* --check --commit \${PRESUBMIT_COMMIT} -- \${PRESUBMIT_FILES}
`,
      wantOptions: ['--include', 'webrtc_apm/*', '--exclude', '*', '--stdout'],
    },
  ])
    it(name, async () => {
      // Test that PRESUMBIT.cfg is parsed and cros format is invoked with the expected arguments.
      await fs.promises.writeFile(
        state.crosFile('src/platform2/PRESUBMIT.cfg').fsPath,
        content
      );

      const file = state.crosFile('src/platform2/foo/foo.c');

      fakeExec.and.callFake(() =>
        Promise.resolve({
          exitStatus: 1,
          stderr: '',
          stdout: 'x',
        })
      );

      const edits = await state.format(new FakeTextDocument({uri: file}));

      if (wantOptions) {
        expect(edits![0].newText).toEqual('x');
        expect(fakeExec).toHaveBeenCalledOnceWith(
          driver.path.join(state.crosRoot, 'chromite/bin/cros'),
          ['format', ...wantOptions, file.fsPath],
          jasmine.anything()
        );
      } else {
        expect(edits).toBeUndefined();
        expect(fakeExec).not.toHaveBeenCalled();
      }
    });
});

describe('isPresubmitignored', () => {
  const tempDir = testing.tempDir();

  it('matches file with correct presubmit ignore pattern', async () => {
    const crosRoot = driver.path.join(tempDir.path, 'chromeos');
    await testing.putFiles(tempDir.path, {
      '.presubmitignore': '**/*',
    });

    await testing.buildFakeChromeos(crosRoot);

    await testing.putFiles(crosRoot, {
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
      expect(
        await isPresubmitignored(driver.path.join(crosRoot, path), crosRoot)
      )
        .withContext(`${path} should ${ignored ? '' : 'not '}be ignored`)
        .toBe(ignored);
    }
  });
});

describe('maybeConfigureOrSuggestSettingDefaultFormatter', () => {
  const {vscodeEmitters, vscodeSpy} = testing.installVscodeDouble();
  testing.installFakeConfigs(vscodeSpy, vscodeEmitters);
  const tempDirCrosRoot = testing.tempDir();
  const tempDirNotCros = testing.tempDir();

  const subscriptions: vscode.Disposable[] = [];
  testing.cleanState(async () => {
    await testing.buildFakeChromeos(tempDirCrosRoot.path);
  });

  it('shows per-workspace suggestion when config not set', async () => {
    await maybeConfigureOrSuggestSettingDefaultFormatter(
      [
        {
          uri: vscode.Uri.file(tempDirCrosRoot.path),
        } as vscode.WorkspaceFolder,
      ],
      extensionId
    );
    expect(vscodeSpy.window.showInformationMessage).toHaveBeenCalledOnceWith(
      jasmine.stringContaining('default formatter in this workspace'),
      jasmine.anything(),
      jasmine.anything(),
      jasmine.anything()
    );
  });

  it('shows per-workspace suggestion when config is another formatter', async () => {
    await config.vscode.editor.defaultFormatter.update('prettier');

    await maybeConfigureOrSuggestSettingDefaultFormatter(
      [
        {
          uri: vscode.Uri.file(tempDirCrosRoot.path),
        } as vscode.WorkspaceFolder,
      ],
      extensionId
    );
    expect(vscodeSpy.window.showInformationMessage).toHaveBeenCalledOnceWith(
      jasmine.stringContaining('default formatter in this workspace'),
      jasmine.anything(),
      jasmine.anything(),
      jasmine.anything()
    );
  });

  it('does not show any suggestion when new folder added is not in a CrOS repo', async () => {
    await maybeConfigureOrSuggestSettingDefaultFormatter(
      [
        {
          uri: vscode.Uri.file(tempDirNotCros.path),
        } as vscode.WorkspaceFolder,
      ],
      extensionId
    );
    expect(vscodeSpy.window.showInformationMessage).not.toHaveBeenCalled();
  });

  it('does not show any suggestion when config is already set to the one by extension', async () => {
    await config.vscode.editor.defaultFormatter.update('Google.cros-ide');

    await maybeConfigureOrSuggestSettingDefaultFormatter(
      [
        {
          uri: vscode.Uri.file(tempDirCrosRoot.path),
        } as vscode.WorkspaceFolder,
      ],
      extensionId
    );
    expect(vscodeSpy.window.showInformationMessage).not.toHaveBeenCalled();
  });

  it('updates workspace default formatter config value if user says yes and suggests setting it in all workspaces', async () => {
    await config.vscode.editor.defaultFormatter.update('prettier');

    const chromiumideConfig = FakeWorkspaceConfiguration.fromSection(
      'chromiumide',
      subscriptions
    );
    vscodeSpy.workspace.getConfiguration
      .withArgs('chromiumide')
      .and.returnValue(chromiumideConfig);

    vscodeSpy.window.showInformationMessage
      .withArgs(
        jasmine.stringContaining('default formatter in this workspace'),
        jasmine.anything(),
        jasmine.anything(),
        jasmine.anything()
      )
      .and.returnValue('Yes');
    vscodeSpy.window.showInformationMessage
      .withArgs(
        jasmine.stringContaining('default formatter in all workspace'),
        jasmine.anything(),
        jasmine.anything()
      )
      .and.returnValue(undefined);

    await maybeConfigureOrSuggestSettingDefaultFormatter(
      [
        {
          uri: vscode.Uri.file(tempDirCrosRoot.path),
        } as vscode.WorkspaceFolder,
      ],
      extensionId
    );

    // Confirm default formatter is updated to the one provided by the extension.
    expect(config.vscode.editor.defaultFormatter.get()).toEqual(
      'Google.cros-ide'
    );
    expect(vscodeSpy.window.showInformationMessage).toHaveBeenCalledTimes(2);
  });

  it('updates workspace but not global per-workspace suggestion config if user requests so', async () => {
    await config.vscode.editor.defaultFormatter.update('prettier');
    const chromiumideConfig = FakeWorkspaceConfiguration.fromSection(
      'chromiumide',
      subscriptions
    );
    vscodeSpy.workspace.getConfiguration
      .withArgs('chromiumide')
      .and.returnValue(chromiumideConfig);
    vscodeSpy.window.showInformationMessage
      .withArgs(
        jasmine.stringContaining('default formatter in this workspace'),
        jasmine.anything(),
        jasmine.anything(),
        jasmine.anything()
      )
      .and.returnValue("Don't ask again in this workspace");

    await maybeConfigureOrSuggestSettingDefaultFormatter(
      [
        {
          uri: vscode.Uri.file(tempDirCrosRoot.path),
        } as vscode.WorkspaceFolder,
      ],
      extensionId
    );

    await maybeConfigureOrSuggestSettingDefaultFormatter(
      [
        {
          uri: vscode.Uri.file(tempDirCrosRoot.path),
        } as vscode.WorkspaceFolder,
      ],
      extensionId
    );

    // Users will not be prompted on the second time and default formatter remains unchanged.
    expect(vscodeSpy.window.showInformationMessage).toHaveBeenCalledTimes(1);
    expect(config.vscode.editor.defaultFormatter.get()).toEqual('prettier');
    expect(chromiumideConfig.inspect('crosFormat.suggestSetAsDefault')).toEqual(
      jasmine.objectContaining({
        workspaceValue: false,
      })
    );
  });

  it('do not suggest setting default formatter again ever if user requests so', async () => {
    await config.vscode.editor.defaultFormatter.update('prettier');
    const chromiumideConfig = FakeWorkspaceConfiguration.fromSection(
      'chromiumide',
      subscriptions
    );
    vscodeSpy.workspace.getConfiguration
      .withArgs('chromiumide')
      .and.returnValue(chromiumideConfig);
    vscodeSpy.window.showInformationMessage
      .withArgs(
        jasmine.stringContaining('default formatter in this workspace'),
        jasmine.anything(),
        jasmine.anything(),
        jasmine.anything()
      )
      .and.returnValue('Never ask again');

    await maybeConfigureOrSuggestSettingDefaultFormatter(
      [
        {
          uri: vscode.Uri.file(tempDirCrosRoot.path),
        } as vscode.WorkspaceFolder,
      ],
      extensionId
    );

    await maybeConfigureOrSuggestSettingDefaultFormatter(
      [
        {
          uri: vscode.Uri.file(tempDirCrosRoot.path),
        } as vscode.WorkspaceFolder,
      ],
      extensionId
    );

    // Users will not be prompted on the second time and default formatter remains unchanged.
    expect(vscodeSpy.window.showInformationMessage).toHaveBeenCalledTimes(1);
    expect(config.vscode.editor.defaultFormatter.get()).toEqual('prettier');
    expect(chromiumideConfig.inspect('crosFormat.suggestSetAsDefault')).toEqual(
      jasmine.objectContaining({
        globalValue: false,
      })
    );
  });

  it('updates workspace default formatter config value if always set as default is enabled', async () => {
    await config.vscode.editor.defaultFormatter.update('prettier');

    const chromiumideConfig = FakeWorkspaceConfiguration.fromSection(
      'chromiumide',
      subscriptions
    );
    // User has enabled always automatically set default formatter in any CrOS workspace.
    await chromiumideConfig.update('crosFormat.alwaysDefaultInCros', true);
    vscodeSpy.workspace.getConfiguration
      .withArgs('chromiumide')
      .and.returnValue(chromiumideConfig);

    // User added a non-Cros folder.
    await maybeConfigureOrSuggestSettingDefaultFormatter(
      [
        {
          uri: vscode.Uri.file(tempDirNotCros.path),
        } as vscode.WorkspaceFolder,
      ],
      extensionId
    );
    // Do nothing.
    expect(config.vscode.editor.defaultFormatter.get()).toEqual('prettier');
    expect(vscodeSpy.window.showInformationMessage).not.toHaveBeenCalled();

    // User added a CrOS folder.
    await maybeConfigureOrSuggestSettingDefaultFormatter(
      [
        {
          uri: vscode.Uri.file(tempDirCrosRoot.path),
        } as vscode.WorkspaceFolder,
      ],
      extensionId
    );
    // Confirm default formatter is automatically updated to the one provided by the extension
    // without prompting user at all.
    expect(config.vscode.editor.defaultFormatter.get()).toEqual(
      'Google.cros-ide'
    );
    expect(vscodeSpy.window.showInformationMessage).not.toHaveBeenCalled();

    // User reset default formatter to something else manually afterwards.
    await config.vscode.editor.defaultFormatter.update('prettier');
    // CrOS folder is added again.
    await maybeConfigureOrSuggestSettingDefaultFormatter(
      [
        {
          uri: vscode.Uri.file(tempDirCrosRoot.path),
        } as vscode.WorkspaceFolder,
      ],
      extensionId
    );
    // Default formatter should retain its value set and will not be updated nor prompts user.
    expect(config.vscode.editor.defaultFormatter.get()).toEqual('prettier');
    expect(vscodeSpy.window.showInformationMessage).not.toHaveBeenCalled();
  });
});
