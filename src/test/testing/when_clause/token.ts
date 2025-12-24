// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * The operands that can be used in when clauses. Except for "!" a space must exist before and after
 * an operand for tokenization to work and otherwise the result of tokenization is undetermined.
 */
export enum Op {
  Neq = '!=', // this should come before Not to take precedence over it.
  Not = '!',
  And = '&&',
  Or = '||',
  Eq = '==',
  Gt = '>',
  Ge = '>=',
  Lt = '<',
  Le = '<=',
  RegEq = '=~',
  In = 'in',
  NotIn = 'not in', // we enforce there to be exactly one space between not and in.
}

type LiteralToken =
  | {
      kind: 'boolean';
      value: boolean;
    }
  | {
      kind: 'number';
      value: number;
    }
  | {
      kind: 'string';
      value: string; // value without the "'"s.
    }
  | {
      kind: 'regex';
      value: RegExp;
    };

type IdToken = {
  kind: 'id';
  value: string;
};

export type Token =
  | LiteralToken
  | IdToken
  | {
      kind: 'op';
      value: Op;
    }
  | {
      kind: 'lparen' | 'rparen';
    };

/**
 * Class to tokenize the when clause, whose methods can throw on tokenization failure.
 */
export class Scanner {
  private p = 0;

  constructor(private readonly when: string) {}

  /**
   * Consumes a character. The argument if exists is compared with the read character and if they
   * mismatch an error is thrown.
   *
   * @throws Error on expectation mismatch.
   */
  private nextChar(expectation?: string): string | undefined {
    const c = this.when[this.p++];
    if (expectation && expectation !== c) {
      throw new Error(
        `nextChar: unexpected character ${c}; want ${expectation}`
      );
    }
    return c;
  }
  private peekChar(): string | undefined {
    return this.when[this.p];
  }
  private skipSpaces(): void {
    while (this.peekChar() === ' ') {
      this.nextChar();
    }
  }
  private advance(n: number): void {
    this.p += n;
  }
  private peekString(n: number): string {
    return this.when.substring(this.p, this.p + n);
  }
  private isEos(): boolean {
    return this.peekChar() === undefined;
  }

  /**
   * Reads a string literal.
   *
   * @throws Error on failure.
   */
  private nextString(): string {
    this.nextChar("'");

    let r = '';
    for (let c = this.nextChar(); c !== "'"; c = this.nextChar()) {
      if (c === undefined) {
        throw new Error(`incomplete string literal: '${r}`);
      }
      r += c;
    }

    return r;
  }

  /**
   * Reads and returns a RegExp literal. TODO: support regular expression flags.
   *
   * @throws Error on failure.
   */
  private nextRegex(): RegExp {
    this.nextChar('/');

    let r = '';

    for (let c = this.nextChar(); c !== '/'; c = this.nextChar()) {
      if (c === undefined) {
        throw new Error(`incomplete regex: ${r}`);
      }
      r += c;
      // Read \/ in chunk.
      if (c === '\\') {
        const c2 = this.nextChar();
        if (c2 === undefined) throw new Error(`incomplete regex: ${r}`);

        r += c2;
      }
    }

    return new RegExp(r);
  }

  private nextNonSpaces(): string {
    let id = '';
    for (
      let c = this.peekChar();
      c && c !== ' ' && c !== ')';
      c = this.peekChar()
    ) {
      this.nextChar();
      id += c;
    }
    return id;
  }

  private peeked: Token | undefined | 'nothing' = 'nothing';

  /**
   * @returns Equivalent of next() without consuming the token.
   * @throws On tokenize failure.
   */
  peek(): Token | undefined {
    if (this.peeked !== 'nothing') {
      return this.peeked;
    }
    this.peeked = this.next();
    return this.peeked;
  }

  /**
   * @returns The next token, or undefined when EOS is reached.
   * @throws On tokenize failure.
   */
  next(): Token | undefined {
    if (this.peeked !== 'nothing') {
      const res = this.peeked;
      this.peeked = 'nothing';
      return res;
    }

    this.skipSpaces();

    if (this.isEos()) {
      return undefined;
    }

    // Parens
    if (this.peekChar() === '(') {
      this.nextChar();
      return {kind: 'lparen'};
    } else if (this.peekChar() === ')') {
      this.nextChar();
      return {kind: 'rparen'};
    }

    // String literals
    if (this.peekChar() === "'") {
      return {kind: 'string', value: this.nextString()};
    }

    // Regex
    if (this.peekChar() === '/') {
      return {kind: 'regex', value: this.nextRegex()};
    }

    // Operands
    for (const op of Object.values(Op)) {
      const checkSpace = op !== Op.Not;
      const s = this.peekString(op.length + (checkSpace ? 1 : 0));
      if (s.trim() === op) {
        this.advance(op.length);
        return {kind: 'op', value: op};
      }
    }

    // Literal or identifier
    const s = this.nextNonSpaces();
    if ('0' <= s[0] && s[0] <= '9') {
      return {kind: 'number', value: Number(s)};
    } else if (s === 'true' || s === 'false') {
      return {kind: 'boolean', value: s === 'true'};
    }
    return {kind: 'id', value: s};
  }
}
