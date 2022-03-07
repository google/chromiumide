#!/bin/bash
# Copyright 2022 The Chromium OS Authors. All rights reserved.
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

cd "$(dirname "$0")" || exit 1

npm list typescript || npm ci
npx ts-node ./src/tools/install.ts "$@"
