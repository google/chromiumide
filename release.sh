#!/bin/bash
# Copyright 2022 The ChromiumOS Authors
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

set -e

cd "$(dirname "$0")"

if [ -n "${FETCH_IDE_RELEASE_CREDENTIALS_FROM_GCLOUD}" ]; then
  OVSX_PAT="$(gcloud secrets versions access 1 --secret ChromiumIDE_OVSX_PAT --project chromeos-bot)"
  VSCE_PAT="$(gcloud secrets versions access 1 --secret ChromiumIDE_VSCE_PAT --project chromeos-bot)"
fi

OVSX_PAT="${OVSX_PAT:=}" VSCE_PAT="${VSCE_PAT:=}" npx ts-node \
  ./tools/release.ts "$@"
