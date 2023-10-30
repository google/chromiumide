# e2e

This directory contains end to end test suites that are run by `npm run
e2e-test` command. End to end tests are the only test suites that can depend on
repositories outside cros-ide.

E2E tests are flaky by its nature and running them is not a requirement for
uploading a CL.

Currently E2E tests doesn't invoke any real VSCode instance. They run in the
same condition as the unit tests except you can assume the entire chromiumos
repository is checked out.

# Prerequisites

## Cpp xrefs

Before running `npm run e2e-test`, ensure you have run the following command.

```
cros build-packages --board=amd64-generic
```
