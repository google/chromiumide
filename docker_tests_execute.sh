#!/bin/bash

# Copyright 2023 The ChromiumOS Authors
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

# Run the IDE extension's NPM test using stabilized versions, this is written
# currently to run by PRESUBMIT.cfg primarily.

set -e
set -x

cd "$(dirname "$0")"

# Create a temp directory, using the builder specified tmp if available.
temp_dir=${TEMP:-/tmp}
if [[ ! -d ${temp_dir} ]]; then
  mkdir -p "${temp_dir}"
fi

temp_dir=$(mktemp -d "${temp_dir}/XXXXXX")
echo "Created temporary directory: ${temp_dir}"

sudo rsync -a --include="**/.git*" "/home/chrome-bot-docker/ro/infra" \
                                   "${temp_dir}"

# Chown everything.
sudo chown -R chrome-bot-docker:chrome-bot-docker "${temp_dir}"

cd "${temp_dir}/infra/ide" || exit 1

# Install the version of node there.
cipd ensure -ensure-file .node_cipd_ensure -root "${temp_dir}/cipd"

# Augment the path.
PATH=${temp_dir}/cipd/bin:${PATH}

echo "Node version: $(node -v)"
echo "NPM version: $(npm -v)"

cd chromiumide || exit 1

echo "Running npm install"
npm install

echo "Running npm cq-tests"
npm run cq-test

echo "Removing temp directory"
rm -rf "${temp_dir}"
