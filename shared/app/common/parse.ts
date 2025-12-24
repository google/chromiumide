// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

export class OptionsParser {
  private p = 0;
  private readonly line;

  /**
   * Create a parser that parses the line representing command line options into an array.
   *
   * By default it doesn't support long options, which is suitable for SSH commands for example.
   */
  constructor(
    line: string,
    private readonly opts?: {
      allowLongOptions?: boolean;
      /** Allows args that don't follow a option switch. */
      allowArgs?: boolean;
      allowEqualSeparator?: boolean;
    }
  ) {
    this.line = line.trim() + '\n'; // append newline as a sentinel value
  }

  parseOrThrow(): string[] {
    const options: string[] = [];

    while (this.p < this.line.length) {
      if (this.peek() !== '-' && this.opts?.allowArgs) {
        const arg = this.readOptionValue();
        if (arg) options.push(arg);
        this.skipSpaces();
        continue;
      }

      const optionSwitch = this.readOptionSwitch();
      this.skipSpaces();
      const optionValue = this.readOptionValue();
      this.skipSpaces();

      options.push(optionSwitch);
      if (optionValue) options.push(optionValue);
    }

    return options;
  }

  // Following private methods can throw on parse failure.
  private readOptionSwitch(): string {
    const start = this.p;

    if (this.peek() !== '-') {
      throw new Error(
        `got "${this.line.substring(
          this.p
        )}"; expected option switch starting with "-"`
      );
    }

    this.next(); // read '-' and the next character
    const second = this.next();

    if (second === '-' && this.opts?.allowLongOptions) {
      for (;;) {
        const c = this.next();
        if (isWhite(c)) break;
        if (c === '=' && this.opts.allowEqualSeparator) break;
      }
      return this.line.substring(start, this.p - 1);
    }

    if (this.peek() === '=' && this.opts?.allowEqualSeparator) {
      this.next();
    }

    return this.line.substring(start, this.p);
  }

  private skipSpaces(): void {
    while (isWhite(this.peek())) {
      this.next();
    }
  }

  private readOptionValue(): string | undefined {
    const first = this.peek();
    if (first === '-' || first === undefined) {
      return undefined;
    }
    const quote = first === '"' || first === "'" ? first : undefined;
    if (quote) this.next();

    let value = '';

    if (quote) {
      let escaped = false;
      for (;;) {
        const c = this.next();
        if (!escaped && c === quote) break;
        if (!escaped && c === '\\' && quote === '"') {
          escaped = true;
          continue;
        }
        value += c;
        escaped = false;
      }
      return value;
    }

    const start = this.p;
    while (!isWhite(this.next())); // noop in loop
    return this.line.substring(start, this.p - 1);
  }

  private isEos(): boolean {
    return this.p >= this.line.length;
  }

  private peek(): string | undefined {
    return this.line[this.p];
  }

  private next(): string {
    if (this.isEos()) {
      throw new Error('unexpected end of line');
    }
    return this.line[this.p++];
  }
}

function isWhite(c: string | undefined): boolean {
  return c === ' ' || c === '\t' || c === '\n' || c === '\r';
}
