// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Schema for output from legacy analyzers
// https://chromium.googlesource.com/infra/infra/+/HEAD/go/src/infra/tricium/docs/contribute.md#legacy-analyzers

// Messages are defined in
// https://source.chromium.org/chromium/infra/infra/+/main:go/src/infra/tricium/api/v1/
export type Results = {
  comments?: Comment[];
};

export type Comment = {
  category: string;
  message: string;
  /** Not set for the commit message. */
  path?: string;
  /** 1-based, inclusive. */
  startLine?: number;
  /** 1-based, inclusive. */
  endLine: number;
  /**
   * 0-based, inclusive.
   *
   * Can be empty when the value is 0.
   */
  startChar?: number;
  /** 0-based, exclusive. */
  endChar: number;
  suggestions: Suggestion[];
};

export type Suggestion = {
  description: string;
  replacements: Replacement[];
};

export type Replacement = {
  path: string;
  replacement: string;
  startLine: number;
  endLine: number;
  startChar: number;
  endChar: number;
};

/** Represents `Files` in data.proto. */
export type DataFiles = {
  files?: File[];
  commit_message?: string;
};

export type File = {
  path: string;
};
