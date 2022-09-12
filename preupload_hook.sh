#!/bin/bash
# Copyright 2022 The ChromiumOS Authors
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

# Run tests to ensure the extension works.
set -e

# Ignore changes outside of ide_tooling
if ! [[ "$*" =~ /chromite/ide_tooling/ ]]; then
  exit 0
fi

if [[ "$*" =~ /chromite/ide_tooling/cros-ide/ ]]; then
  cd "$(dirname "$0")/cros-ide" || exit 1

  npx ts-node ./src/tools/preupload_hook.ts || exit $?
fi

if [[ "$*" =~ /chromite/ide_tooling/scripts/ ]]; then
  ./run_tests ide_tooling/scripts/*_unittest.py
fi
