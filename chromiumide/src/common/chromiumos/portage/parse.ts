// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';

export type EclassName = {
  name: string;
  range: vscode.Range;
};

export type EbuildVarName = {
  name: string;
  range: vscode.Range;
};

export type EbuildStrValue = {
  kind: 'string';
  value: string;
  range: vscode.Range;
};

export type EbuildArrayValue = {
  kind: 'array';
  value: EbuildStrValue[];
  range: vscode.Range; // Range of the array including '(' and ')'.
};

export type EbuildValue = EbuildStrValue | EbuildArrayValue;

type EbuildAssignment = {
  name: EbuildVarName;
  value: EbuildValue;
};

export class ParsedEbuild {
  constructor(
    readonly assignments: readonly EbuildAssignment[],
    readonly inherits: readonly EclassName[] = []
  ) {}

  // Return the last assignment if there are multiple matches.
  getValue(variableName: string): EbuildValue | undefined {
    return this.assignments
      .slice()
      .reverse()
      .find((x: EbuildAssignment) => x.name.name === variableName)?.value;
  }

  // Return the value assigned to the variable as an array, casted to a singleton array if initial
  // value is a string.
  // Use the last assignment if there are multiple matches.
  getAsStringValues(variableName: string): EbuildStrValue[] | undefined {
    const value = this.getValue(variableName);
    return value ? (value.kind === 'array' ? value.value : [value]) : undefined;
  }

  // Return the string value assigned to the variable, casted to a singleton array if initial value
  // is a string.
  // Use the last assignment if there are multiple matches.
  getString(variableName: string): string | undefined {
    const value = this.getValue(variableName);
    return value && value.kind === 'string' ? value.value : undefined;
  }

  // Return the value assigned to the variable as a primitive string array (without the ranges),
  // casted to a singleton array if initial value is a string.
  // Use the last assignment if there are multiple matches.
  getAsStrings(variableName: string): string[] | undefined {
    const values = this.getAsStringValues(variableName);
    return values ? values.map(sv => sv.value) : undefined;
  }
}

function indexToPositions(content: string): vscode.Position[] {
  const positions: vscode.Position[] = [];
  let row = 0;
  let col = 0;
  for (const c of content) {
    positions.push(new vscode.Position(row, col));
    if (c === '\n') {
      row += 1;
      col = 0;
    } else if (c === '\t') {
      // Tab \t occupies 2 spaces in vscode range.
      col += 2;
    } else {
      col += 1;
    }
  }
  return positions;
}

export function parseEbuildOrThrow(content: string): ParsedEbuild {
  const positions = indexToPositions(content);

  // RE for matching lines with variable assignment or inherits eclass.
  const focusLineStartRE = /(?:([\w_][\w\d_]*)=|inherit )/gm;

  const assignments = [];
  const inherits = [];

  let m;
  while ((m = focusLineStartRE.exec(content))) {
    const scanner = new Scanner(content, positions, focusLineStartRE.lastIndex);

    if (m[0] === 'inherit ') {
      let eclass = scanner.nextEclass();
      while (eclass !== undefined) {
        inherits.push(eclass);
        eclass = scanner.nextEclass();
      }
      focusLineStartRE.lastIndex = scanner.lastIndex;
    } else {
      const name = {
        name: m[1],
        range: new vscode.Range(
          // Range of variable name starts from index of matched string and ends at that
          // of the matched last index, minus 1 for trailing '='.
          positions[m.index],
          positions[focusLineStartRE.lastIndex - 1]
        ),
      };

      const value = scanner.nextValue();

      focusLineStartRE.lastIndex = scanner.lastIndex;

      assignments.push({
        name,
        value,
      });
    }
  }

  return new ParsedEbuild(assignments, inherits);
}

class Scanner {
  constructor(
    private readonly content: string,
    private readonly positions: vscode.Position[],
    private p: number
  ) {}

  get lastIndex() {
    return this.p;
  }

  private peek(): string {
    if (this.p >= this.content.length) {
      throw new Error('Ebuild parse failed: unclosed paren or string?');
    }
    return this.content.charAt(this.p);
  }

  private next(): string {
    const c = this.peek();
    this.p++;
    return c;
  }

  nextValue(): EbuildValue {
    if (this.peek() === '(') {
      const startPos = this.positions[this.p];
      this.next();

      const value: EbuildStrValue[] = [];

      for (;;) {
        this.skipSpaces();
        if (this.peek() === ')') {
          this.next();
          return {
            kind: 'array',
            value,
            range: new vscode.Range(startPos, this.positions[this.p]),
          };
        }
        value.push(this.nextString());
      }

      throw new Error('Ebuild parse failed: unclosed paren');
    }

    return this.nextString();
  }

  /**
   * Return eclass string starting at current position, or undefined if none.
   * Skip spaces after the found eclass.
   *
   */
  nextEclass(): EclassName | undefined {
    const eclass = this.nextString();
    if (!eclass.value) return undefined;
    // If a non-empty string is parsed (i.e. eclass), skip all spaces until end of line.
    if (this.peek() !== '\n') {
      this.skipSpaces();
    }
    const name = eclass.value;
    const range = eclass.range;
    return {name, range};
  }

  private skipSpaces(): void {
    for (;;) {
      switch (this.peek()) {
        // comment line
        case '#': {
          while (this.next() !== '\n');
          continue;
        }
        case '\t':
        case '\n':
        case ' ':
          this.next();
          continue;
        default:
          return;
      }
    }
  }

  private nextString(): EbuildStrValue {
    switch (this.peek()) {
      case '"': {
        this.next();
        const startPos = this.positions[this.p];
        let s = '';
        for (;;) {
          const c = this.next();
          if (c === '"') {
            return {
              kind: 'string',
              value: s,
              range: new vscode.Range(startPos, this.positions[this.p - 1]),
            };
          }
          s += c;
        }
      }
      case '\t':
      case '\n':
      case ' ': {
        return {
          kind: 'string',
          value: '',
          range: new vscode.Range( // empty range
            this.positions[this.p],
            this.positions[this.p]
          ),
        };
      }
      default: {
        const startPos = this.positions[this.p];
        let s = '';
        for (;;) {
          const c = this.peek();
          if (c === '\t' || c === '\n' || c === ' ' || c === ')') {
            return {
              kind: 'string',
              value: s,
              // Range has +1 overload for the ending position.
              range: new vscode.Range(startPos, this.positions[this.p]),
            };
          }
          s += c;
          this.next();
        }
      }
    }
  }
}
