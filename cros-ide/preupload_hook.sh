#!/bin/bash
# Copyright 2022 The ChromiumOS Authors.
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

# Run tests to ensure the extension works.
set -e

# Ignore changes outside of ide_tooling/cros_ide.
if ! [[ "$*" =~ /chromite/ide_tooling/cros-ide/ ]]; then
  exit 0
fi

cd "$(dirname "$0")" || exit 1

npx ts-node ./src/tools/preupload_hook.ts
