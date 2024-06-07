// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {FakeTextDocument} from './text_document';

export class FakeTextEditor implements vscode.TextEditor {
  readonly document: FakeTextDocument;
  options: vscode.TextEditorOptions;
  get selection(): vscode.Selection {
    return this.selections[0];
  }
  selections: readonly vscode.Selection[] = [new vscode.Selection(0, 0, 0, 0)];
  readonly viewColumn: vscode.ViewColumn | undefined;
  readonly visibleRanges: readonly vscode.Range[] = [];

  constructor(
    document: FakeTextDocument,
    options?: {
      tabSize: number;
      insertSpaces: boolean;
    }
  ) {
    this.document = document;
    this.options = {
      tabSize: options?.tabSize ?? 2,
      insertSpaces: options?.insertSpaces ?? true,
    };
  }

  async edit(
    callback: (editBuilder: vscode.TextEditorEdit) => void,
    _options?: {
      readonly undoStopBefore: boolean;
      readonly undoStopAfter: boolean;
    }
  ): Promise<boolean> {
    const editBuilder = new FakeTextEditorEdit();
    callback(editBuilder);

    const text = applyEdits(this.document, editBuilder.edits);
    if (!text) return false;
    this.document.text = text;

    return true;
  }

  insertSnippet(
    _snippet: vscode.SnippetString,
    _location?:
      | vscode.Range
      | vscode.Position
      | readonly vscode.Range[]
      | readonly vscode.Position[]
      | undefined,
    _options?:
      | {readonly undoStopBefore: boolean; readonly undoStopAfter: boolean}
      | undefined
  ): Thenable<boolean> {
    throw new Error('Method not implemented.');
  }

  setDecorations(
    _decorationType: vscode.TextEditorDecorationType,
    _rangesOrOptions:
      | readonly vscode.Range[]
      | readonly vscode.DecorationOptions[]
  ): void {}

  revealRange(
    _range: vscode.Range,
    _revealType?: vscode.TextEditorRevealType | undefined
  ): void {}

  show(_column?: vscode.ViewColumn | undefined): void {}

  hide(): void {}
}

class FakeTextEditorEdit implements vscode.TextEditorEdit {
  edits: vscode.TextEdit[] = [];

  replace(location: vscode.Range | vscode.Position, value: string): void {
    this.edits.push(
      vscode.TextEdit.replace(
        location instanceof vscode.Range
          ? location
          : new vscode.Range(location, location),
        value
      )
    );
  }

  insert(location: vscode.Position, value: string): void {
    this.edits.push(vscode.TextEdit.insert(location, value));
  }

  delete(location: vscode.Range): void {
    this.edits.push(vscode.TextEdit.delete(location));
  }

  setEndOfLine(_endOfLine: vscode.EndOfLine): void {
    throw new Error('Method not implemented.');
  }
}

function applyEdits(
  document: FakeTextDocument,
  edits: readonly vscode.TextEdit[]
): string | undefined {
  // Check that the edits are not overlapping (i.e. illegal). Reference:
  // https://github.com/microsoft/vscode/blob/d2d053d84e2460661c435ac825b1b1895f7efd51/src/vs/workbench/api/common/extHostTextEditor.ts#L614
  const sortedEdits = [...edits].sort(
    // Sort ascending (by end and then by start).
    (editA, editB) => {
      const [a, b] = [editA.range, editB.range];
      if (a.end.line === b.end.line) {
        if (a.end.character === b.end.character) {
          if (a.start.line === b.start.line) {
            return a.start.character - b.start.character;
          }
          return a.start.line - b.start.line;
        }
        return a.end.character - b.end.character;
      }
      return a.end.line - b.end.line;
    }
  );

  // Check that no edits are overlapping.
  for (let i = 0; i < sortedEdits.length - 1; i++) {
    const rangeEnd = sortedEdits[i].range.end;
    const nextRangeStart = sortedEdits[i + 1].range.start;

    if (nextRangeStart.isBefore(rangeEnd)) {
      // overlapping ranges
      return undefined;
    }
  }

  // This is very inefficient, but probably okay for tests.
  let text = document.text;
  for (const edit of [...sortedEdits].reverse()) {
    const start = document.offsetAt(edit.range.start);
    const end = document.offsetAt(edit.range.end);
    text = text.substring(0, start) + edit.newText + text.substring(end);
  }
  return text;
}
