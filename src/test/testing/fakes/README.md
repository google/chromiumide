## Testing Commons: Fakes

This directory contains various common fake implementations that can be used
from both unit tests and integration tests.

Modules here may import `vscode` module, but corresponding fake implementations
must be provided in `src/test/unit/injected_modules/vscode` so that they can
be still used in unit tests.

Make sure `index.ts` to re-export all exported symbols in other `*.ts` files in
this directory (but not those under subdirectories) so that we don't need to
import individual modules.
