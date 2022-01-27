#!/bin/bash
# Copyright 2022 The Chromium OS Authors. All rights reserved.
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

# Run tests to ensure the extension works.
# TODO(oka): Consider writing the script in Typescript if the file becomes big.

set -e

cd "$(dirname "$0")" || exit 1

# Build
npm run package
