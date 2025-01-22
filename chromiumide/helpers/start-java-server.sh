#!/bin/sh -eu
# Copyright 2025 The ChromiumOS Authors
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

extension_dir="$(dirname -- "$(dirname -- "$0")")"
readonly extension_dir
readonly jar_dir="${extension_dir}/third_party/java-language-server/dist/classpath"

# --add-exports and --add-opens are needed to access the compiler API.
# https://github.com/georgewfraser/java-language-server/blob/HEAD/dist/launch_linux.sh
# Make sure to keep the jar files in sync with
# third_party/java-language-server/pom.xml.
exec "${JAVA_HOME:?}/bin/java" \
  --add-exports "jdk.compiler/com.sun.tools.javac.api=ALL-UNNAMED" \
  --add-exports "jdk.compiler/com.sun.tools.javac.code=ALL-UNNAMED" \
  --add-exports "jdk.compiler/com.sun.tools.javac.comp=ALL-UNNAMED" \
  --add-exports "jdk.compiler/com.sun.tools.javac.main=ALL-UNNAMED" \
  --add-exports "jdk.compiler/com.sun.tools.javac.tree=ALL-UNNAMED" \
  --add-exports "jdk.compiler/com.sun.tools.javac.model=ALL-UNNAMED" \
  --add-exports "jdk.compiler/com.sun.tools.javac.util=ALL-UNNAMED" \
  --add-opens "jdk.compiler/com.sun.tools.javac.api=ALL-UNNAMED" \
  --class-path "${jar_dir}/gson-2.8.9.jar:${jar_dir}/protobuf-java-3.19.6.jar:${jar_dir}/java-language-server.jar" \
  "$@"
