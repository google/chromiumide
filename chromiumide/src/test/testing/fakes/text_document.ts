// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';

/** A fake readonly version of a VSCode TextDocument for testing. */
export class FakeTextDocument implements vscode.TextDocument {
  private static count = 1;
  uri = vscode.Uri.parse(`untitled:///Untitled-${FakeTextDocument.count++}`);
  get fileName(): string {
    return this.uri.fsPath;
  }
  get isUntitled(): boolean {
    return this.uri.scheme === 'untitled';
  }

  languageId = 'plaintext';
  version = 1;
  isClosed = false;
  notebook: vscode.NotebookDocument | undefined = undefined;
  eol = vscode.EndOfLine.LF;

  isDirty = false;
  async save(): Promise<boolean> {
    this.isDirty = false;
    return true;
  }

  text = '';
  getText(range?: vscode.Range): string {
    if (range) {
      const lines = this.lines;

      const startIndex =
        lines.slice(0, range.start.line).reduce((a, b) => a + b.length + 1, 0) +
        range.start.character;
      const endIndex =
        lines.slice(0, range.end.line).reduce((a, b) => a + b.length + 1, 0) +
        range.end.character;

      return this.text.substring(startIndex, endIndex);
    }
    return this.text;
  }

  constructor({
    uri,
    text,
    languageId,
    version,
    isClosed,
    isDirty,
    notebook,
    eol,
  }: {
    uri?: vscode.Uri;
    text?: string;
    languageId?: string;
    version?: number;
    isClosed?: boolean;
    isDirty?: boolean;
    notebook?: vscode.NotebookDocument;
    eol?: vscode.EndOfLine;
  } = {}) {
    this.uri = uri ?? this.uri;
    this.text = text ?? this.text;
    this.languageId = languageId ?? this.languageId;
    this.version = version ?? this.version;
    this.isDirty = isDirty ?? this.isDirty;
    this.isClosed = isClosed ?? this.isClosed;
    this.notebook = notebook ?? this.notebook;
    this.eol = eol ?? this.eol;
  }

  private get lines(): string[] {
    return this.text.split(/\n/g);
  }

  get lineCount(): number {
    return this.lines.length;
  }

  lineAt(lineOrPos: number | vscode.Position): vscode.TextLine {
    if (lineOrPos instanceof vscode.Position) {
      return this.lineAt(lineOrPos.line);
    }
    const isLastLine = lineOrPos === this.lines.length - 1;
    return new TextLine(lineOrPos, this.lines[lineOrPos], isLastLine);
  }

  offsetAt(position: vscode.Position): number {
    position = this.validatePosition(position);
    let offset = 0;
    for (let i = 0; i < position.line; i++) {
      offset += this.lines[i].length + 1; // +1 (position after last character)
    }
    return offset + position.character;
  }

  positionAt(offset: number): vscode.Position {
    let line = 0;
    while (offset > this.lines[line].length) {
      offset -= this.lines[line].length + 1; // +1 (position after last character)
      if (line < this.lines.length - 1) {
        line += 1;
      } else {
        return new vscode.Position(line, this.lines[line].length);
      }
    }
    return new vscode.Position(line, offset);
  }

  validateRange(range: vscode.Range): vscode.Range {
    const start = this.validatePosition(range.start);
    const end = this.validatePosition(range.end);
    if (start === range.start && end === range.end) {
      return range;
    }
    return new vscode.Range(start, end);
  }

  validatePosition(position: vscode.Position): vscode.Position {
    if (this.lines.length === 0 || position.line < 0) {
      return new vscode.Position(0, 0);
    }
    if (position.line >= this.lines.length) {
      const line = this.lines.length - 1;
      return new vscode.Position(line, this.lines[line].length);
    }
    if (position.character < 0) {
      return new vscode.Position(position.line, 0);
    }
    const maxCharacter = this.lines[position.line].length;
    if (position.character > maxCharacter) {
      return new vscode.Position(position.line, maxCharacter);
    }
    return position;
  }

  getWordRangeAtPosition(
    position: vscode.Position,
    regexp = /(\w|\d)+/g
  ): vscode.Range | undefined {
    regexp = ensureGlobalRegExp(regexp);
    const line = this.lineAt(position);
    for (const match of line.text.matchAll(regexp)) {
      // index is always defined for String.matchAll matches.
      // See https://github.com/microsoft/TypeScript/issues/36788
      const start = match.index!;
      const end = start + match[0].length;

      if (end > position.character) {
        if (start <= position.character) {
          return new vscode.Range(position.line, start, position.line, end);
        } else {
          // We've moved past the position without finding an overlapping word
          break;
        }
      }
    }
    return undefined;
  }
}

function ensureGlobalRegExp(regexp: RegExp): RegExp {
  if (regexp.global) {
    return regexp;
  } else {
    return new RegExp(regexp.source, 'g' + regexp.flags);
  }
}

/**
 * Basic implementation of the VSCode TextLine interface, representing (you
 * guessed it) a line of text in a file/editor.
 */
class TextLine implements vscode.TextLine {
  readonly range = new vscode.Range(
    new vscode.Position(this.lineNumber, 0),
    new vscode.Position(this.lineNumber, this.text.length)
  );
  readonly rangeIncludingLineBreak = this.isLastLine
    ? this.range
    : new vscode.Range(
        new vscode.Position(this.lineNumber, 0),
        new vscode.Position(this.lineNumber + 1, 0)
      );
  readonly firstNonWhitespaceCharacterIndex =
    this.text.match(/^\s*/)![0].length;
  readonly isEmptyOrWhitespace =
    this.firstNonWhitespaceCharacterIndex === this.text.length;
  constructor(
    readonly lineNumber: number,
    readonly text: string,
    private readonly isLastLine: boolean
  ) {}
}
