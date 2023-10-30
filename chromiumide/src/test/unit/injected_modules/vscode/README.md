## Fake vscode module

This is a fake "vscode" module made available to unit tests.

IMPORTANT: Fake vscode module MUST NOT depend on any other module that can
depend on the vscode module. Otherwise circular dependencies would cause
strange errors sensitive to import order (b/237621808).
