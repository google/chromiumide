#!/bin/bash
# Copyright 2022 The ChromiumOS Authors
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

set -e

cd "$(dirname "$0")"

OVSX_PAT="${OVSX_PAT:=}" VSCE_PAT="${VSCE_PAT:=}" npx ts-node \
  ./tools/release.ts "$@"
