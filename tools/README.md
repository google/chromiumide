# Tools

Contains scripts for ChromiumIDE development, such as one to build the extension.

Any script in this directory should not be used for user-facing purpose, and can do less strict
error handling. In particular, any function can throw an error without having `OrThrow` suffix.
