This directory contains modules that unit tests can import as top-level
modules. We set the NODE_PATH environment variable on running unit tests
to "inject" these modules.

Namely, "vscode" module provides fake implementations of various basic
classes provided by the real vscode module, which allows unit tests to
depend on them.
