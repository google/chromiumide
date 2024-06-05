// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * Parse command options. Currently it is for SSH options, and since the ssh command doesn't have
 * long options, the parser doesn't support them.
 */
export class OptionsParser {
  private p = 0;

  constructor(private readonly line: string) {}

  parseOrThrow(): string[] {
    const options: string[] = [];

    while (this.p < this.line.length) {
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
    this.next();

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
