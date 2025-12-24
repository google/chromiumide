#!/bin/bash
# Copyright 2024 The ChromiumOS Authors
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

# Runs unit tests in parallel by running jasmine with the --parallel flag. The script kills the
# worker processes Jasmine spawns when it is run with the --parallel flag, because otherwise the
# wireit command doesn't exit, waiting for the worker processes to finish.

# Usage: ./tools/run_unit_tests_in_parallel.sh

cd "$(dirname "$0")/.." || exit $?

# Kills all the processes with the given process group ID.
kill_all() {
  pgid="$1"
  pkill -g "${pgid}"
}

# Outputs the process group of the given process.
get_pgid() {
  # xargs to trim spaces
  ps -o pgid= -p "$1" | xargs || exit 1
}

# Internal usage only. It runs the actual unit tests, outputting the process group to the given file
# to make the process group management possible.
if [[ -n "$1" ]]; then
  pgid="$(get_pgid $$)"

  echo "${pgid}" > "$1"

  env NODE_OPTIONS='-r source-map-support/register' NODE_PATH=out/src/test/unit/injected_modules npx jasmine --config=src/test/unit/jasmine.json --parallel=32 --color

  exit $?
fi

pgid_file="$(mktemp)"
trap 'rm ${pgid_file}' EXIT

setsid ./tools/run_unit_tests_in_parallel.sh "${pgid_file}" &
test_pid=$!

trap 'kill_all $(cat ${pgid_file})' INT TERM

wait "${test_pid}"

# When the inner command that runs that actual unit tests exists with ${status}, kill all processes
# belong to the group logged in ${pgid_file} and exit with the same status to report the test
# success/failure.
status=$?

kill_all "$(cat "${pgid_file}")"

exit "${status}"
