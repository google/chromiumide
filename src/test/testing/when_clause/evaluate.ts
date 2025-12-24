// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {Op, Scanner} from './token';

/**
 * Parses and evaluates a when clause [1] under the given context. It returns an error on parse
 * failure. This function is only meant for testing and could produce false negatives (returning an
 * error for valid expression).
 *
 * We parse the when clause based on the following BNF form [2].
 *
 * * <when-clause> ::= <or-expr>
 * * <or-expr>     ::= <and-expr> | <and-expr> "||" <or-expr>
 * * <and-expr>    ::= <eq-expr>  | <eq-expr> "&&" <and-expr>
 * * <eq-expr>     ::= <cmp-expr> | <cmp-expr> <eq-op> <eq-expr>
 * * <cmp-expr>    ::= <not-expr> | <not-expr> <cmp-op> <cmp-expr>
 * * <not-expr>    ::= <factor>   | "!" <not-expr>
 * * <factor>      ::= <literal> | <id> | "(" <or-expr> ")"
 *
 * * <eq-op>   ::= "==" | "!=" | "=~"
 * * <cmp-op>  ::= ">" | ">=" | "<" | "<=" | "in" | "not in"
 * * <literal> ::= {boolean literal} | {number literal} | {string literal} | {regex literal}
 * * <id> ::= {string id}
 *
 * * [1] https://code.visualstudio.com/api/references/when-clause-contexts.
 * * [2] https://en.wikipedia.org/wiki/Backus%E2%80%93Naur_form
 */
export function evaluateWhenClause(
  when: string,
  context: Record<string, Value>
): boolean | Error {
  try {
    return new Evaluator(new Scanner(when), context).evaluateOrThrow();
  } catch (e) {
    return new Error(
      `Failed to evaluate when clause "${when}" under the context ${JSON.stringify(
        context
      )}: ${e}`
    );
  }
}

type Value = boolean | number | string | RegExp | string[];

class Evaluator {
  constructor(
    private readonly sc: Scanner,
    private readonly context: Record<string, Value>
  ) {}

  /**
   * @returns The evaluation result
   * @throws Error on evaluation failure
   */
  evaluateOrThrow(): boolean {
    const res = booleanOrThrow(this.orExpr());
    const next = this.sc.next();
    if (next !== undefined) {
      throw new Error(`got token ${JSON.stringify(next)}; want end of string`);
    }
    return res;
  }

  private orExpr(): Value {
    const left = this.andExpr();
    switch (this.lookupOp(Op.Or)) {
      case undefined:
        return left;
      case Op.Or:
        return this.orExpr() || left; // make sure to read the rhs.
    }
  }

  private andExpr(): Value {
    const left = this.eqExpr();
    switch (this.lookupOp(Op.And)) {
      case undefined:
        return left;
      case Op.And:
        return this.andExpr() && left; // make sure to read the rhs.
    }
  }

  private eqExpr(): Value {
    const left = this.cmpExpr();
    switch (this.lookupOp(Op.Eq, Op.Neq, Op.RegEq)) {
      case undefined:
        return left;
      // the right-hand side is a value and not interpreted as a context key, meaning it is not
      // looked up in the context.
      // https://code.visualstudio.com/api/references/when-clause-contexts#equality-operators
      case Op.Eq:
        return left === this.cmpExpr(/* rhs = */ true);
      case Op.Neq:
        return left !== this.cmpExpr(/* rhs = */ true);
      case Op.RegEq:
        return regExpOrThrow(this.cmpExpr()).test(stringOrThrow(left));
    }
  }

  private cmpExpr(rhs?: boolean): Value {
    const left = this.notExpr(rhs);
    switch (this.lookupOp(Op.Gt, Op.Ge, Op.Lt, Op.Le, Op.In, Op.NotIn)) {
      case undefined:
        return left;
      case Op.Gt:
        return numberOrThrow(left) > numberOrThrow(this.cmpExpr());
      case Op.Ge:
        return numberOrThrow(left) >= numberOrThrow(this.cmpExpr());
      case Op.Lt:
        return numberOrThrow(left) < numberOrThrow(this.cmpExpr());
      case Op.Le:
        return numberOrThrow(left) <= numberOrThrow(this.cmpExpr());
      // TODO: allow the rhs to be an object.
      case Op.In:
        return stringArrayOrThrow(this.cmpExpr()).includes(stringOrThrow(left));
      case Op.NotIn:
        return !stringArrayOrThrow(this.cmpExpr()).includes(
          stringOrThrow(left)
        );
    }
  }

  private notExpr(rhs?: boolean): Value {
    switch (this.lookupOp(Op.Not)) {
      case undefined:
        return this.factor(rhs);
      case Op.Not:
        return !this.notExpr();
    }
  }

  private factor(rhs?: boolean): Value {
    const token = this.sc.next();
    if (token === undefined || token.kind === 'op' || token.kind === 'rparen') {
      throw new Error(
        `unexpected token ${token} found when either literal, id, or left paren was expected`
      );
    }
    switch (token.kind) {
      case 'boolean':
      case 'number':
      case 'string':
      case 'regex':
        return token.value;
      case 'lparen': {
        const value = this.orExpr();
        const rparen = this.sc.next();
        if (rparen?.kind !== 'rparen') {
          throw new Error(
            `unexpected token ${rparen} found when the right paren was expected`
          );
        }
        return value;
      }
      case 'id':
        return rhs ? token.value : this.context[token.value];
    }
  }

  /**
   * Tests if the next token is included in ops and if so consumes and returns it. Otherwise returns
   * undefined.
   */
  private lookupOp<A extends Op>(...ops: A[]): A | undefined {
    const t = this.sc.peek();
    if (t === undefined) return undefined;
    if (t.kind !== 'op') return undefined;
    for (const op of ops) {
      if (t.value === op) {
        this.sc.next();
        return op;
      }
    }
    return undefined;
  }
}

function booleanOrThrow(x: Value): boolean {
  if (typeof x !== 'boolean') throw new Error(`type of ${x} must be boolean`);
  return x;
}

function numberOrThrow(x: Value): number {
  if (typeof x !== 'number') throw new Error(`type of ${x} must be number`);
  return x;
}

function stringOrThrow(x: Value): string {
  if (typeof x !== 'string') throw new Error(`type of ${x} must be string`);
  return x;
}

function regExpOrThrow(x: Value): RegExp {
  if (!(x instanceof RegExp)) throw new Error(`${x} must be a RegExp instance`);
  return x;
}

function stringArrayOrThrow(x: Value): string[] {
  if (!Array.isArray(x) || (x.length > 0 && typeof x[0] !== 'string')) {
    throw new Error(`${x} must be a string array`);
  }
  return x;
}
