// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs/promises';
import * as path from 'path';
import {
  DirNode,
  LinkNode,
  OutputDirectoriesDataProvider,
} from '../../../../features/chromium/output_directories';
import * as config from '../../../../services/config';
import * as testing from '../../../testing';
import * as fakes from '../../../testing/fakes';
import type {ThemeIcon} from 'vscode';

describe('OutputDirectoriesDataProvider', () => {
  const tempDir = testing.tempDir();
  const {fakeExec} = testing.installFakeExec();

  const DEFAULT_ERROR = {
    type: 'error',
    error: 'Unable to parse JSON output: invalid json here',
  } as const;

  beforeEach(async () => {
    await config.paths.depotTools.update('/opt/custom_depot_tools');

    // By default, pretend that `gn args` finishes, but returns invalid JSON.
    fakeExec.and.callFake(async (name, args, options) => {
      expect(name).toEqual('gn');
      expect(args[0]).toEqual('args');

      expect(options?.cwd).toBe(tempDir.path);
      expect(options?.env).toBeTruthy();
      expect(options?.env!.PATH).toEqual(
        jasmine.stringMatching('^/opt/custom_depot_tools:.*/depot_tools')
      );
      return {exitStatus: 0, stdout: 'invalid json here', stderr: ''};
    });
  });

  it('ignores files that are named like output directories', async () => {
    await fs.writeFile(path.join(tempDir.path, 'out'), 'test1');
    await fs.writeFile(path.join(tempDir.path, 'out_hatch'), 'test2');

    const dataProvider = new OutputDirectoriesDataProvider(
      {subscriptions: []},
      new fakes.VoidOutputChannel(),
      tempDir.path
    );

    const nodes = await dataProvider.getChildren();
    expect(nodes).toEqual([]);
  });

  it('ignores output directories that are just one level deep', async () => {
    await fs.mkdir(path.join(tempDir.path, 'out'));

    const dataProvider = new OutputDirectoriesDataProvider(
      {subscriptions: []},
      new fakes.VoidOutputChannel(),
      tempDir.path
    );

    const nodes = await dataProvider.getChildren();
    expect(nodes).toEqual([]);
  });

  it('ignores output directories that contain additional files on the first level', async () => {
    // `out/blah` is a valid output directory in theory, except that there are also files in `out/`,
    // which no longer makes `out/blah` a valid output directory.
    await fs.mkdir(path.join(tempDir.path, 'out'));
    await fs.mkdir(path.join(tempDir.path, 'out/blah'));
    await fs.writeFile(path.join(tempDir.path, 'out/args.gn'), 'foo');

    const dataProvider = new OutputDirectoriesDataProvider(
      {subscriptions: []},
      new fakes.VoidOutputChannel(),
      tempDir.path
    );

    const nodes = await dataProvider.getChildren();
    expect(nodes).toEqual([]);
  });

  it('finds output directories', async () => {
    await fs.mkdir(path.join(tempDir.path, 'random-non-out-dir'));
    await fs.mkdir(path.join(tempDir.path, 'non-out-dir_out'));
    await fs.mkdir(path.join(tempDir.path, 'out'));
    await fs.mkdir(path.join(tempDir.path, 'out/dir2'));
    await fs.mkdir(path.join(tempDir.path, 'out_hatch'));
    await fs.mkdir(path.join(tempDir.path, 'out/dir1'));
    await fs.mkdir(path.join(tempDir.path, 'out_hatch/dir4'));
    await fs.mkdir(path.join(tempDir.path, 'out_hatch/dir3'));

    const dataProvider = new OutputDirectoriesDataProvider(
      {subscriptions: []},
      new fakes.VoidOutputChannel(),
      tempDir.path
    );

    const nodes = await dataProvider.getChildren();
    await dataProvider.getNodeCacheForTesting()!.gnArgsPromise;
    // This also tests that the nodes are sorted.
    expect(nodes).toEqual([
      new DirNode('out_hatch/dir3', false, DEFAULT_ERROR),
      new DirNode('out_hatch/dir4', false, DEFAULT_ERROR),
      new DirNode('out/dir1', false, DEFAULT_ERROR),
      new DirNode('out/dir2', false, DEFAULT_ERROR),
    ]);
  });

  it('finds symlinks', async () => {
    await fs.mkdir(path.join(tempDir.path, 'out'));
    await fs.mkdir(path.join(tempDir.path, 'out/dir2'));
    await fs.mkdir(path.join(tempDir.path, 'out_hatch'));
    await fs.mkdir(path.join(tempDir.path, 'out_hatch/dir3'));
    await fs.symlink(
      path.join(tempDir.path, 'out/dir2'),
      path.join(tempDir.path, 'out/current_link')
    );
    await fs.symlink(
      path.join(tempDir.path, 'out_hatch/dir3'),
      path.join(tempDir.path, 'out_hatch/a_link')
    );
    await fs.symlink(
      '/this/path/does/not/exist',
      path.join(tempDir.path, 'out_hatch/non_existing_link')
    );
    await fs.symlink(
      tempDir.path,
      path.join(tempDir.path, 'out_hatch/outside_link')
    );

    const dataProvider = new OutputDirectoriesDataProvider(
      {subscriptions: []},
      new fakes.VoidOutputChannel(),
      tempDir.path
    );

    const nodes = await dataProvider.getChildren();
    await dataProvider.getNodeCacheForTesting()!.gnArgsPromise;
    // This also tests that the nodes are sorted.
    expect(nodes).toEqual([
      new LinkNode('out_hatch/a_link', 'out_hatch/dir3'),
      new LinkNode('out_hatch/outside_link', null),
      new LinkNode('out/current_link', 'out/dir2'),
      new DirNode('out_hatch/dir3', false, DEFAULT_ERROR),
      new DirNode('out/dir2', true, DEFAULT_ERROR),
    ]);
  });

  it('can refresh output directories', async () => {
    await fs.mkdir(path.join(tempDir.path, 'out'));
    await fs.mkdir(path.join(tempDir.path, 'out/dir1'));

    const dataProvider = new OutputDirectoriesDataProvider(
      {subscriptions: []},
      new fakes.VoidOutputChannel(),
      tempDir.path
    );

    let nodes = await dataProvider.getChildren();
    await dataProvider.getNodeCacheForTesting()!.gnArgsPromise;
    expect(nodes).toEqual([new DirNode('out/dir1', false, DEFAULT_ERROR)]);

    await fs.mkdir(path.join(tempDir.path, 'out/dir2'));
    dataProvider.refresh();

    nodes = await dataProvider.getChildren();
    await dataProvider.getNodeCacheForTesting()!.gnArgsPromise;
    // This also tests that the nodes are sorted.
    expect(nodes).toEqual([
      new DirNode('out/dir1', false, DEFAULT_ERROR),
      new DirNode('out/dir2', false, DEFAULT_ERROR),
    ]);
  });

  for (const testCase of [
    {
      name: 'shows warning if code is compiled locally',
      gnArgs: [{name: 'foo_bar', current: {value: 'true'}}],
      wantIcon: 'warning',
      wantWarnings: [
        'Neither Goma, Siso, nor Reclient is enabled. Your builds will compile on your local machine only.',
      ],
      wantArgs: {use_siso: false, use_goma: false, use_remoteexec: false},
    },
    {
      name: 'shows no warning if code is compiled in the cloud',
      gnArgs: [{name: 'use_goma', current: {value: 'true'}}],
      wantIcon: 'file-directory',
      wantWarnings: [],
      wantArgs: {use_siso: false, use_goma: true, use_remoteexec: false},
    },
  ]) {
    it(`queries GN args correctly and ${testCase.name}`, async () => {
      await fs.mkdir(path.join(tempDir.path, 'out'));
      await fs.mkdir(path.join(tempDir.path, 'out/dir1'));

      fakeExec.installStdout(
        'gn',
        [
          'args',
          path.join(tempDir.path, 'out', 'dir1'),
          '--list',
          '--short',
          '--overrides-only',
          '--json',
        ],
        JSON.stringify(testCase.gnArgs),
        jasmine.objectContaining({cwd: tempDir.path})
      );

      const dataProvider = new OutputDirectoriesDataProvider(
        {subscriptions: []},
        new fakes.VoidOutputChannel(),
        tempDir.path
      );

      const nodes = await dataProvider.getChildren();
      await dataProvider.getNodeCacheForTesting()!.gnArgsPromise;
      expect(nodes).toEqual([
        new DirNode('out/dir1', false, {
          type: 'success',
          args: testCase.wantArgs,
          warnings: testCase.wantWarnings,
        }),
      ]);
      const treeItem = dataProvider.getTreeItem(nodes[0])!;
      expect((treeItem.iconPath as ThemeIcon).id).toBe(testCase.wantIcon);
    });
  }
});
