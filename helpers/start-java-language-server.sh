#!/bin/sh -eu
# Copyright 2025 The ChromiumOS Authors
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

exec "$(dirname -- "$0")/start-java-server.sh" org.javacs.Main "$@"
