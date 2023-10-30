// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

type BreadcrumbsIdentity = string;
const IDENTITY_SEPARATOR = '/';

function identity(breadcrumbs: readonly string[]): BreadcrumbsIdentity {
  return breadcrumbs.join(IDENTITY_SEPARATOR);
}

/**
 * Immutable data structure representing breadcrumbs to reach a tree item from the root node. It is
 * guaranteed that two Breadcrumbs instances representing the same breadcrumbs are identical and can
 * be used as a key of Set or Map.
 */
export class Breadcrumbs {
  private static readonly knownBreadcrumbs = new Map<
    BreadcrumbsIdentity,
    Breadcrumbs
  >();

  private constructor(readonly breadcrumbs: readonly string[]) {
    if (Breadcrumbs.knownBreadcrumbs.has(identity(breadcrumbs))) {
      throw new Error(
        `Internal error: same breadcrumbs (${breadcrumbs}) already exist; make sure to create the instance with Breadcrumbs.from()`
      );
    }
  }

  /** Creates a breadcrumbs from the strings. */
  static from(...breadcrumbs: string[]): Breadcrumbs {
    for (const b in breadcrumbs) {
      if (b.includes(IDENTITY_SEPARATOR)) {
        throw new Error(
          `Internal error: breadcrumb ${b} shouldn't contain ${IDENTITY_SEPARATOR}`
        );
      }
    }
    const id = identity(breadcrumbs);
    const existing = this.knownBreadcrumbs.get(id);
    if (existing) return existing;
    const res = new this(breadcrumbs);
    this.knownBreadcrumbs.set(id, res);
    return res;
  }

  /** The empty breadcrumbs. */
  static readonly EMPTY = Breadcrumbs.from();

  /** Returns a new Breadcrumbs. */
  pushed(token: string): Breadcrumbs {
    return Breadcrumbs.from(...this.breadcrumbs, token);
  }

  /** Returns whether the breadcrumbs starts with the prefix. */
  startsWith(prefix: Breadcrumbs): boolean {
    for (let i = 0; i < prefix.breadcrumbs.length; i++) {
      if (prefix.breadcrumbs[i] !== this.breadcrumbs[i]) {
        return false;
      }
    }
    return true;
  }

  /** Returns the length of the breadcrumbs. */
  get length(): number {
    return this.breadcrumbs.length;
  }

  /**
   * Returns the parent breadcrumbs. It returns an empty breadcrumbs for an
   * empty breadcrumbs.
   */
  parent(): Breadcrumbs {
    return Breadcrumbs.from(
      ...this.breadcrumbs.slice(0, this.breadcrumbs.length - 1)
    );
  }
}
