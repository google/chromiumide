#!/bin/bash -eu

case "$1" in
build-info)
  echo '{
  "sourcePaths": [
    "chrome/java",
    "content/java"
  ],
  "classPaths": [
    "third_party/android_sdk/android_sdk_empty.jar"
  ]
}';;
*)
  echo "$0: invalid option -- '$1'" >&2
  exit 1
esac
