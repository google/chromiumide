# Copyright 2023 The ChromiumOS Authors
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

"""Chromium IDE unit test."""

from pathlib import Path

from chromite.lib import cros_build_lib
from chromite.lib import cros_test_lib


class IDETest(cros_test_lib.TestCase):
    """Tests of Chromium IDE."""

    def setUp(self):
        self.ide_dir = Path(__file__).resolve().parent

    def testNpmAvailable(self):
        """Check that the npm command is available in the test environment."""
        # TODO(b:279819145): Check the node version is same as written in .nvmrc
        cros_build_lib.run(["npm", "--version"], cwd=str(self.ide_dir))
        cros_build_lib.run(["npm", "version"], cwd=str(self.ide_dir))
