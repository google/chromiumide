// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

export type EbuildValue =
  | {
      kind: 'string';
      value: string;
    }
  | {
      kind: 'array';
      value: string[];
    };

type EbuildAssignment = {
  name: string;
  value: EbuildValue;
};

export type ParsedEbuild = {
  assignments: EbuildAssignment[];
};

export function parseEbuildOrThrow(content: string): ParsedEbuild {
  const assignmentStartRe = /^([\w_][\w\d_]*)=/gm;

  const assignments = [];

  let m;
  while ((m = assignmentStartRe.exec(content))) {
    const name = m[1];

    const scanner = new Scanner(content, assignmentStartRe.lastIndex);

    const value = scanner.nextValue();

    assignmentStartRe.lastIndex = scanner.lastIndex;

    assignments.push({
      name,
      value,
    });
  }

  return {
    assignments,
  };
}

class Scanner {
  constructor(private readonly content: string, private p: number) {}

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
      this.next();

      const value: string[] = [];

      for (;;) {
        this.skipSpaces();
        if (this.peek() === ')') {
          this.next();
          break;
        }
        value.push(this.nextString());
      }

      return {
        kind: 'array',
        value,
      };
    }

    const value = this.nextString();
    return {
      kind: 'string',
      value,
    };
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

  private nextString(): string {
    switch (this.peek()) {
      case '"': {
        this.next();
        let s = '';
        for (;;) {
          const c = this.next();
          if (c === '"') return s;
          s += c;
        }
      }
      case '\t':
      case '\n':
      case ' ': {
        return '';
      }
      default: {
        let s = '';
        for (;;) {
          const c = this.peek();
          if (c === '\t' || c === '\n' || c === ' ' || c === ')') return s;
          s += c;
          this.next();
        }
      }
    }
  }
}
