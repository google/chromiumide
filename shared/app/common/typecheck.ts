// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/** Statically asserts that the value has the `never` type */
export function assertNever(x: never): never {
  throw new Error(`Internal Error: assertNever(${x})`);
}

/**
 * Statically asserts the type is never.
 *
 * Usage: type _ = AssertNever<X>;
 */
export type AssertNever<T extends never> = T;

/** Statically asserts the type is true. */
export type AssertTrue<T extends true> = T;

/**
 * The type that becomes true if and only if X and Y are the same type, and otherwise false.
 *
 * Example: type _ = AssertTrue<Equal<X, Y>>
 *
 * Reference: https://github.com/microsoft/TypeScript/issues/27024#issuecomment-421529650
 *
 * It seems there's no way to have a generic AssertEqual type directly.
 */
export type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends <
  T
>() => T extends Y ? 1 : 2
  ? true
  : false;
