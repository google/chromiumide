#!/bin/bash
# Copyright 2022 The ChromiumOS Authors
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

terminal_color_clear='\033[0m'
terminal_color_warning='\033[1;31m'
min_node_ver=v14

echoWarning() {
  printf "${terminal_color_warning}%s${terminal_color_clear}\n" "$1"
}

cd "$(dirname "$0")" || exit 1

if ! which node > /dev/null; then
  echoWarning "node not found; please install it following \
http://go/nodejs/installing-node"
  exit 1
fi

current_version="$(node --version)";
if [[ "${current_version}" < "${min_node_ver}" ]]; then
  echoWarning "Node version ${current_version} is too low. Please get node \
${min_node_ver} or higher to avoid unexpected issues."
  exit 1
fi

npm ci || exit $?
npx ts-node ./src/tools/install.ts "$@"
