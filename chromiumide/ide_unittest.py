# Copyright 2023 The ChromiumOS Authors
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

"""ChromiumIDE unit test"""

# To run the test, run the following command under `chromite`.
# ./run_tests --network ide_tooling/cros-ide/ide_unittest.py

import functools
import os
from pathlib import Path

from chromite.lib import cipd
from chromite.lib import cros_build_lib
from chromite.lib import cros_test_lib


@functools.lru_cache(maxsize=None)
def _ensure_nodejs() -> Path:
    """Find or install the node tool"""
    path = cipd.InstallPackage(
        cipd.GetCIPDFromCache(),
        "infra/3pp/tools/nodejs/linux-amd64",
        "version:2@16.13.0",
    )
    if not path:
        raise Exception("npm not found in cipd")
    return Path(path)


@cros_test_lib.pytestmark_network_test
class IdeTest(cros_test_lib.TestCase):
    """Tests of ChromiumIDE"""

    def testNpmCiWorks(self):
        ide_dir = Path(__file__).resolve().parent

        nodejs_bin = _ensure_nodejs() / "bin"
        npm = nodejs_bin / "npm"

        path = os.environ.get("PATH") or ""
        env = {"PATH": str(nodejs_bin) + ":" + path}

        cros_build_lib.run([npm, "--version"], cwd=ide_dir, env=env)
        cros_build_lib.run([npm, "version"], cwd=ide_dir, env=env)
        # This installs dependencies from the https://npm.skia.org/chromiumide
        # registry as instructed by .npmrc .
        cros_build_lib.run([npm, "ci"], cwd=ide_dir, env=env)

    # TODO: Run `npm run lint`, `npm run unit-test`, and more.
