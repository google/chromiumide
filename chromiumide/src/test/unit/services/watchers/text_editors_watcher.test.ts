// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {TextEditorsWatcher} from '../../../../services';
import * as testing from '../../../testing';

function textDocument(uri: vscode.Uri) {
  return {
    uri: uri,
  } as vscode.TextDocument;
}

function textEditor(document: vscode.TextDocument) {
  return {
    document,
  } as vscode.TextEditor;
}

describe('open text editors watcher', () => {
  const {vscodeEmitters, vscodeGetters} = testing.installVscodeDouble();

  it('fires after onDidChangeActiveTextEditor (first time) and onDidCloseTextDocument', async () => {
    // file that's already opened when VSCode starts
    const uriInitial = vscode.Uri.file('/src/initial.cc');
    const docInitial = textDocument(uriInitial);
    const editorInitial = textEditor(docInitial);

    vscodeGetters.window.activeTextEditor.and.returnValue(editorInitial);

    const watcher = TextEditorsWatcher.createForTesting();
    const activateReader = new testing.EventReader(watcher.onDidActivate);
    const closeReader = new testing.EventReader(watcher.onDidClose);

    // not really needed, but we dispose objects anyway
    const subscriptions: vscode.Disposable[] = [
      watcher,
      activateReader,
      closeReader,
    ];

    const uriA = vscode.Uri.file('/src/a.cc');
    const docA = textDocument(uriA);
    const editorA = textEditor(docA);

    // first onDidChangeActiveTextEditor triggers the watcher.
    vscodeEmitters.workspace.onDidOpenTextDocument.fire(docA);
    vscodeEmitters.window.onDidChangeActiveTextEditor.fire(editorA);

    expect(await activateReader.read()).toEqual(docA);

    const uriB = vscode.Uri.file('/src/b.cc');
    const docB = textDocument(uriB);

    // onDidOpenTextDocument without onDidChangeActiveTextEditor does not trigger the watcher
    vscodeEmitters.workspace.onDidOpenTextDocument.fire(docB);
    vscodeEmitters.workspace.onDidCloseTextDocument.fire(docB);

    // another onDidChangeActiveTextEditor does not trigger it
    vscodeEmitters.window.onDidChangeActiveTextEditor.fire(editorA);

    // when docA is closed we trigger an event, this also verifies
    // that closing docB did not trigger an event
    vscodeEmitters.workspace.onDidCloseTextDocument.fire(docA);
    expect(await closeReader.read()).toEqual(docA);

    // Closing the initially opened file triggers an event.
    vscodeEmitters.workspace.onDidCloseTextDocument.fire(docInitial);
    expect(await closeReader.read()).toEqual(docInitial);

    // To verify that events did not happen we trigger another event.
    const uriC = vscode.Uri.file('/src/c.cc');
    const docC = textDocument(uriC);
    vscodeEmitters.workspace.onDidOpenTextDocument.fire(docC);
    vscodeEmitters.window.onDidChangeActiveTextEditor.fire(textEditor(docC));

    expect(await activateReader.read()).toEqual(docC);

    // repeating onDidOpenTextDocument and onDidChangeActiveTextEditor triggers the event again
    vscodeEmitters.workspace.onDidOpenTextDocument.fire(docA);
    vscodeEmitters.window.onDidChangeActiveTextEditor.fire(editorA);

    expect(await activateReader.read()).toEqual(docA);

    vscode.Disposable.from(...subscriptions).dispose();
  });
});
