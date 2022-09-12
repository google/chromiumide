// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

type StateInitializer<T> = (() => Promise<T>) | (() => T);

/**
 * See go/cleanstate for details.
 *
 * Usage:
 *
 * describe('Foo', () => {
 *   const state = cleanState(() => {foo: new Foo()});
 *
 *   it('does bar', () => {
 *     expect(state.foo.bar()).toBeTrue();
 *   });
 * })
 *
 * Beware that class methods are not assigned to the returned object.
 * Writing `cleanState(() => new Foo())` in the above code doesn't work.
 */
export function cleanState<NewState extends {}>(
  init: StateInitializer<NewState>
): NewState {
  const state = {} as NewState;
  beforeEach(async () => {
    // Clear state before every test case.
    for (const prop of Object.getOwnPropertyNames(state)) {
      delete (state as {[k: string]: unknown})[prop];
    }
    Object.assign(state, await init());
  });
  return state;
}
