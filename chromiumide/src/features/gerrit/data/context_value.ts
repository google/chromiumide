// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * Type of a string assignable to the comments' context value.
 */
export type CommentContextValue =
  `${CommentPublicity}${CommentResolveState}${CommentEditState}`;

export enum CommentPublicity {
  /** Used to indicate a comment is public and can be linked to. */
  Public = '<public>',
  /** Used to indicate a comment is a draft, and can't be linked to. */
  Draft = '<draft>',
}

export enum CommentResolveState {
  Resolved = '<resolved>',
  Unresolved = '<unresolved>',
}

export enum CommentEditState {
  Editing = '<editing>',
  NoEditing = '',
}
