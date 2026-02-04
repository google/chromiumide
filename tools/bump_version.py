#!/usr/bin/env python3
#
# Copyright 2026 The ChromiumOS Authors
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

import argparse
import json
import os
import subprocess
import sys

_ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main():
    parser = argparse.ArgumentParser(description='Bump version in package.json')
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--release', action='store_true', help='Bump to release version (even minor)')
    group.add_argument('--pre-release', action='store_true', help='Bump to pre-release version (odd minor)')

    args = parser.parse_args()

    # Determine path to package.json relative to this script
    package_json_path = os.path.abspath(os.path.join(_ROOT_DIR, 'package.json'))

    with open(package_json_path, 'r') as f:
        data = json.load(f)

    current_version = data['version']
    major, minor, patch = map(int, current_version.split('.'))
    is_odd = minor % 2 != 0

    if args.release:
        if is_odd:
            minor += 1
            patch = 0
        else:
            patch += 1
    elif args.pre_release:
        if is_odd:
            patch += 1
        else:
            minor += 1
            patch = 0

    new_version = f"{major}.{minor}.{patch}"
    subprocess.run(
        ['npm', 'version', '--no-commit-hooks', '--no-git-tag-version', new_version],
        cwd=_ROOT_DIR,
        check=True,
    )


if __name__ == '__main__':
    main()
