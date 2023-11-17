#!/bin/bash

# Copyright 2023 The ChromiumOS Authors
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

# Prepare the workspace for the docker build. We need to make symlinkless copies
# of the source tree and place them under the Dockerfile so we can move them
# into the container image.

set -e
set -x

cd "$(dirname "$0")"

# Ensure the .dockercopy directory is cleared.
rm -rf ./dockercopy

TOP_LEVEL=$(repo --show-toplevel)
pushd "${TOP_LEVEL}" || exit 1
rsync -avL --exclude=".dockercopy/*" \
          --exclude="ide/chromiumide/node_modules/*" \
          --exclude="ide/chromiumide/dist/*" \
          --exclude="ide/chromiumide/out/*" \
          --exclude="ide/chromiumide/.vscode-test/*" \
          --exclude="ide/chromiumide/.wireit/*" \
          --include="**/.git*" "./infra/ide" "./infra/ide/.dockercopy"
popd

docker build -t cq-test-image .

# If you want to enter the container interactively then run:
# $ docker run -it cq-test-image /bin/bash

docker run cq-test-image ./ro/infra/ide/docker_tests_execute.sh

# Clean up.
rm -rf ./dockercopy
