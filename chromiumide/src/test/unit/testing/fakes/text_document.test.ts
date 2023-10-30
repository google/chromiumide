// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode'; // from //third_party/vscode/src/vs:vscode
import {FakeTextDocument} from '../../../testing/fakes';

describe('FakeTextDocument', () => {
  it('returns its file name', () => {
    const document = new FakeTextDocument({uri: vscode.Uri.file('/foo.txt')});

    expect(document.fileName).toEqual('/foo.txt');
  });

  it('returns its text', () => {
    const document = new FakeTextDocument({text: 'Hello world!'});

    expect(document.getText()).toEqual('Hello world!');
  });

  it('returns specific lines', () => {
    const document = new FakeTextDocument({text: 'Line 1\nLine 2\nLine 3'});

    expect(() => document.lineAt(-1)).toThrow();
    expect(() => document.lineAt(999)).toThrow();
    expect(() => document.lineAt(new vscode.Position(-1, 0))).toThrow();

    expect(document.lineAt(0).text).toEqual('Line 1');
    expect(document.lineAt(new vscode.Position(1, 0)).text).toEqual('Line 2');
  });

  it('returns the offset for a given position', () => {
    const document = new FakeTextDocument({text: 'Line 1\nLine 2\nLine 3'});

    expect(document.offsetAt(new vscode.Position(0, 0))).toEqual(0);
    expect(document.offsetAt(new vscode.Position(0, 99))).toEqual(
      'Line 1'.length
    );
    expect(document.offsetAt(new vscode.Position(1, 4))).toEqual(11);
    // line.length + 1 positions on each line, -1 because of zero-based indexing
    expect(document.offsetAt(new vscode.Position(999, 999))).toEqual(
      3 * ('Line n'.length + 1) - 1
    );
  });

  it('returns the position for a given offset', () => {
    const document = new FakeTextDocument({text: 'Line 1\nLine 2\nLine 3'});

    expect(() => document.positionAt(-1)).toThrow();
    expect(document.positionAt(0)).toEqual(new vscode.Position(0, 0));
    expect(document.positionAt(10)).toEqual(new vscode.Position(1, 3)); // Mid line
    expect(document.positionAt(13)).toEqual(new vscode.Position(1, 6)); // End of line
    expect(document.positionAt(14)).toEqual(new vscode.Position(2, 0)); // Beginning of next line
    expect(document.positionAt(999)).toEqual(
      new vscode.Position(2, 'Line 3'.length)
    );
  });

  it('validates a given range', () => {
    const document = new FakeTextDocument({text: 'Line 1\nLine 2\nLine 3'});

    const validRange = new vscode.Range(0, 2, 1, 2); //  Li|ne 1\n Li|ne 2

    expect(document.validateRange(validRange)).toEqual(validRange);
    expect(document.validateRange(new vscode.Range(0, 0, 0, 999))).toEqual(
      new vscode.Range(0, 0, 0, 'Line 1'.length)
    ); // Character exceeds
    expect(document.validateRange(new vscode.Range(0, 0, 999, 0))).toEqual(
      new vscode.Range(0, 0, 2, 'Line 3'.length)
    ); // Line exceeds
  });

  it('validates a given position', () => {
    const document = new FakeTextDocument({text: 'Line 1\nLine 2\nLine 3'});

    const validPosition = new vscode.Position(1, 3);

    expect(document.validatePosition(validPosition)).toEqual(validPosition);
    expect(document.validatePosition(new vscode.Position(1, 999))).toEqual(
      new vscode.Position(1, 'Line 2'.length)
    ); // Character exceeds
    expect(document.validatePosition(new vscode.Position(999, 999))).toEqual(
      new vscode.Position(2, 'Line 3'.length)
    ); // Line exceeds
  });

  it('gets text within range', () => {
    const document = new FakeTextDocument({text: 'Line 1\nLine 2\nLine 3'});

    const range = new vscode.Range(0, 2, 1, 3);

    expect(document.getText(range)).toEqual('ne 1\nLin');
  });

  it('gets text exceeding range', () => {
    const document = new FakeTextDocument({text: 'Line 1\nLine 2\nLine 3'});

    const range = new vscode.Range(0, 2, 3, 3);

    expect(document.getText(range)).toEqual('ne 1\nLine 2\nLine 3');
  });

  it('gets text outside range', () => {
    const document = new FakeTextDocument({text: 'Line 1\nLine 2\nLine 3'});

    const range = new vscode.Range(3, 2, 5, 6);

    expect(document.getText(range)).toEqual('');
  });

  it('gets the word at a position', () => {
    const document = new FakeTextDocument({text: 'Line 1\nLine 2\nLine 3'});

    // The 'n' in 'Line 2'
    const position = new vscode.Position(1, 2);

    // The 'Line' in 'Line 2'
    const expectedRange = new vscode.Range(1, 0, 1, 4);

    expect(document.getWordRangeAtPosition(position)).toEqual(expectedRange);
  });

  it('does not return a word range when there is no word at a position', () => {
    const document = new FakeTextDocument({text: 'Line 1\nLine 2\nLine 3'});

    const position = new vscode.Position(1, 4); // The ' ' in 'Line 2'

    expect(document.getWordRangeAtPosition(position)).toBeUndefined();
  });

  it('accepts a RegExp to customize the word range at a position', () => {
    const document = new FakeTextDocument({text: 'Word 1\tWord 2\tWord 3'});

    const position = new vscode.Position(0, 11); // The ' ' in 'Word 2'

    // 'Word 2'
    const expectedRange = new vscode.Range(0, 7, 0, 13);

    expect(document.getWordRangeAtPosition(position, /[\w\d ]+/)).toEqual(
      expectedRange
    );
  });
});
