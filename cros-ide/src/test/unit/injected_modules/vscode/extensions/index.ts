// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

export function getExtension(): never {
  throw new Error(
    'vscode.extensions.getExtension() called: unit tests can not activate extensions'
  );
}
