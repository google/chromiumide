// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {TEST_ONLY} from '../../../features/dir_metadata';
import * as testing from '../../testing';
import * as fakes from '../../testing/fakes';
import {
  FakeCancellationToken,
  FakeStatusManager,
  FakeTextDocument,
  VoidOutputChannel,
} from '../../testing/fakes';

describe('DIR_METADATA', () => {
  const fakeExec = testing.installFakeExec();
  const cipdRepository = fakes.installFakeCipd(fakeExec);

  const {vscodeSpy, vscodeEmitters} = testing.installVscodeDouble();
  testing.installFakeConfigs(vscodeSpy, vscodeEmitters);

  it('creates correct issuetracker URLs', async () => {
    const link = new TEST_ONLY.IssueTrackerComponentLink(
      123456,
      new vscode.Range(1, 2, 3, 4)
    );
    expect(link.target).toEqual(
      vscode.Uri.parse(
        'https://issuetracker.google.com/status:open componentid:123456'
      )
    );
    expect(link.range).toEqual(new vscode.Range(1, 2, 3, 4));
  });

  it('creates correct monorail URLs', async () => {
    await fakeExec.installStdout(
      '/path/to/dirmd',
      [
        'read',
        '-form',
        'sparse',
        '/path/to/folder', // should use the folder containing the file
      ],
      JSON.stringify({dirs: {'.': {monorail: {project: 'project name'}}}})
    );
    const link = new TEST_ONLY.MonorailComponentLink(
      'Some>Component Name',
      '/path/to/folder/DIR_METADATA',
      new vscode.Range(1, 2, 3, 4)
    );
    await link.resolve(
      '/path/to/dirmd',
      new VoidOutputChannel(),
      new FakeCancellationToken()
    );
    expect(link.target).toEqual(
      vscode.Uri.parse(
        'https://bugs.chromium.org/p/project name/issues/list?q=component:Some>Component Name'
      )
    );
    expect(link.range).toEqual(new vscode.Range(1, 2, 3, 4));
  });

  it('defaults to chromium monorail if dirmd does not return a project', async () => {
    await fakeExec.installStdout(
      '/path/to/dirmd',
      [
        'read',
        '-form',
        'sparse',
        '/path/to/folder', // should use the folder containing the file
      ],
      JSON.stringify({dirs: {'.': {}}})
    );
    const link = new TEST_ONLY.MonorailComponentLink(
      'Some>Component Name',
      '/path/to/folder/DIR_METADATA',
      new vscode.Range(1, 2, 3, 4)
    );
    await link.resolve(
      '/path/to/dirmd',
      new VoidOutputChannel(),
      new FakeCancellationToken()
    );
    expect(link.target).toEqual(
      vscode.Uri.parse(
        'https://bugs.chromium.org/p/chromium/issues/list?q=component:Some>Component Name'
      )
    );
    expect(link.range).toEqual(new vscode.Range(1, 2, 3, 4));
  });

  it('extracts component links from DIR_METADATA files', async () => {
    await fakeExec.installStdout(
      '/path/to/dirmd',
      [
        'read',
        '-form',
        'sparse',
        '/path/to/folder', // should use the folder containing the file
      ],
      JSON.stringify({dirs: {'.': {monorail: {project: 'project name'}}}})
    );

    const provider = new TEST_ONLY.ComponentLinksProvider(
      new VoidOutputChannel(),
      new FakeStatusManager(),
      cipdRepository
    );

    const document = new FakeTextDocument({
      uri: vscode.Uri.parse('/path/to/folder/DIR_METADATA'),
      text: `\
foo component_id: 1234
bar component_id: 5678
baz component: "Some>Component"
invalid component: 12345
invalid component_id: "foo"`,
    });
    const links = await provider.provideDocumentLinks(
      document,
      new FakeCancellationToken()
    );

    function withTooltip(link: vscode.DocumentLink): vscode.DocumentLink {
      link.tooltip = 'View bugs';
      return link;
    }

    expect(links).toEqual([
      withTooltip(
        new TEST_ONLY.IssueTrackerComponentLink(
          1234,
          new vscode.Range(0, 4, 0, 22)
        )
      ),
      withTooltip(
        new TEST_ONLY.IssueTrackerComponentLink(
          5678,
          new vscode.Range(1, 4, 1, 22)
        )
      ),
      withTooltip(
        new TEST_ONLY.MonorailComponentLink(
          'Some>Component',
          '/path/to/folder/DIR_METADATA',
          new vscode.Range(2, 4, 2, 31)
        )
      ),
    ]);

    await Promise.all(
      links.map(
        link =>
          link instanceof TEST_ONLY.MonorailComponentLink &&
          link.resolve(
            '/path/to/dirmd',
            new VoidOutputChannel(),
            new FakeCancellationToken()
          )
      )
    );

    expect(links.map(link => link.target)).toEqual([
      vscode.Uri.parse(
        'https://issuetracker.google.com/status:open componentid:1234'
      ),
      vscode.Uri.parse(
        'https://issuetracker.google.com/status:open componentid:5678'
      ),
      vscode.Uri.parse(
        'https://bugs.chromium.org/p/project%20name/issues/list?q=component:Some>Component'
      ),
    ]);
  });
});
