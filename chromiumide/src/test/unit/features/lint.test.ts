// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as path from 'path';
import * as vscode from 'vscode';
import {CrosLintConfig} from '../../../../shared/app/features/lint/cros_lint_config';
import * as testing from '../../testing';
import {FakeTextDocument} from '../../testing/fakes';

describe('Linter integration', () => {
  const tempDir = testing.tempDir();

  const state = testing.cleanState(async () => {
    const chromeosRoot = tempDir.path;
    const {cros} = await testing.buildFakeChromeos(chromeosRoot);

    return {
      chromeosRoot,
      chromeosDocument: (subpath: string) =>
        new FakeTextDocument({
          uri: vscode.Uri.file(path.join(chromeosRoot, subpath)),
        }),
      cros,
    };
  });

  it('honors PRESUBMIT.cfg for cros lint', async () => {
    await testing.putFiles(state.chromeosRoot, {
      'infra/recipes/.git/config': '',
      // Some fields are removed from the real content for brevity.
      'infra/recipes/PRESUBMIT.cfg': `[Hook Scripts]
cros format = cros format --check --commit \${PRESUBMIT_COMMIT} --include '*.proto' --include 'OWNERS*' --exclude '*' \${PRESUBMIT_FILES}
cros lint = cros lint --commit \${PRESUBMIT_COMMIT} \${PRESUBMIT_FILES} --exclude recipes_release/protos/*.py --exclude .recipe_deps/ --exclude recipes.py
check_format = vpython3 repohooks/check_format.py

[Hook Overrides]
# Needed to supply options below
cros_license_check: true
`,
      'foo/PRESUBMIT.cfg': `[Hook Scripts]
no cros lint = echo hello
`,
    });

    const pythonLint = new CrosLintConfig('python');

    expect(
      await pythonLint.command(
        state.chromeosDocument('infra/recipes/recipes.py')
      )
    ).toEqual({
      name: state.cros,
      args: [
        'lint',
        '--exclude',
        'recipes_release/protos/*.py',
        '--exclude',
        '.recipe_deps/',
        '--exclude',
        'recipes.py',
        'recipes.py', // relative path from the directory with PRESUBMIT.cfg
      ],
      cwd: path.join(state.chromeosRoot, 'infra/recipes'),
      extraEnv: {
        PWD: path.join(state.chromeosRoot, 'infra/recipes'),
      },
    });

    expect(
      await pythonLint.command(
        state.chromeosDocument('infra/recipes/recipes/test_plan_filtering.py')
      )
    ).toEqual({
      name: state.cros,
      args: [
        'lint',
        '--exclude',
        'recipes_release/protos/*.py',
        '--exclude',
        '.recipe_deps/',
        '--exclude',
        'recipes.py',
        'recipes/test_plan_filtering.py',
      ],
      cwd: path.join(state.chromeosRoot, 'infra/recipes'),
      extraEnv: {
        PWD: path.join(state.chromeosRoot, 'infra/recipes'),
      },
    });

    expect(
      await pythonLint.command(state.chromeosDocument('foo/bar.py'))
    ).toBeUndefined();

    expect(
      await pythonLint.command(state.chromeosDocument('foo.py'))
    ).toBeUndefined();
  });
});
