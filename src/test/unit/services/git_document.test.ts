// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {getDriver} from '../../../../shared/app/common/driver_repository';
import * as gitDocument from '../../../services/git_document';
import * as testing from '../../testing';

const driver = getDriver();

describe('Git document provider', () => {
  const tempDir = testing.tempDir();

  const state = testing.cleanState(() => {
    return {
      gitDocumentProvider: new gitDocument.GitDocumentProvider(),
    };
  });

  it('retrieves git commit messages (HEAD)', async () => {
    spyOn(driver.metrics, 'send');

    const git = new testing.Git(tempDir.path);
    await git.init();
    await git.commit('sample commit message');

    const uri = vscode.Uri.parse(
      `gitmsg://${git.root}/COMMIT%20MESSAGE?HEAD#spellchecker`
    );
    const doc = await state.gitDocumentProvider.provideTextDocumentContent(uri);
    expect(doc).toContain('sample commit message');
    expect(driver.metrics.send).toHaveBeenCalledOnceWith({
      category: 'interactive',
      group: 'virtualdocument',
      description: 'open git document',
      name: 'virtualdocument_open_document',
      document: 'spellchecker',
    });
  });

  it('retrieves git commit messages (SHA)', async () => {
    spyOn(driver.metrics, 'send');

    const git = new testing.Git(tempDir.path);
    await git.init();
    const commitId = await git.commit('first commit');
    await git.commit('second commit');

    const uri = vscode.Uri.parse(
      `gitmsg://${git.root}/COMMIT%20MESSAGE?${commitId}#gerrit`
    );
    const doc = await state.gitDocumentProvider.provideTextDocumentContent(uri);
    expect(doc).toContain('first commit');
    expect(driver.metrics.send).toHaveBeenCalledOnceWith({
      category: 'interactive',
      group: 'virtualdocument',
      description: 'open git document',
      name: 'virtualdocument_open_document',
      document: 'gerrit',
    });
  });

  it('shows the link to file a bug', async () => {
    const uri = vscode.Uri.parse('gitmsg:///does/not/matter/no_file?HEAD');
    const doc = await state.gitDocumentProvider.provideTextDocumentContent(uri);
    expect(doc).toContain('go/chromiumide-new-bug');
  });
});
