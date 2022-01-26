# vs-plugin README

Currently ***EXPERIMENTAL*** and tested only for google internal developers.
No timely support will be provided.

This plugin consolidates commonly used tools for Chromium OS Development.

## Getting Started with Development

Go to the [QuickStart Guide](https://chromium.googlesource.com/chromiumos/ide_tooling/+/main/docs/quickstart.md)

## Publishing the extension

* Outside chroot, run `npm run publish`. It will build the extension and upload it to
  Cloud storage under [chromeos-velocity](https://pantheon.corp.google.com/storage/browser?project=google.com:chromeos-velocity).

  TODO(oka): Make the command work inside chroot.

## Features

* Autocomplete, x-ref searching, and symbol definition when developing in chroot
* Managing local and remote DUTs
* Code health tooling

## Requirements

TBD

## Extension Settings

## Known Issues


## Release Notes

Users appreciate release notes as you update your extension.

### 1.0.0

TBD

-----------------------------------------------------------------------------------------------------------
## Sticky Notes

* [Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)
* [Project Documentation (Google Internal)]
(http://go/cros-cowabunga)

-----------------------------------------------------------------------------------------------------------
## Dependencies

*Important:* Keep this updated and ensure that unrestrictive
licenses are used

Name: definitely-typed\
URL: https://github.com/DefinitelyTyped/DefinitelyTyped\
Remarks: Pulls in TS data-types published via DefinitelyTyped (i.e. @types/*)\
License: MIT

Name: typescript-eslint\
URL: https://github.com/typescript-eslint/typescript-eslint/\
Remarks:\
License: BSD-2-Clause

Name: eslint\
URL: https://github.com/eslint/eslint\
Remarks:\
License: MIT

Name: eslint-config-google\
URL: https://github.com/google/eslint-config-google\
Remarks:\
License: Apache-2.0

Name: glob\
URL: https://github.com/isaacs/node-glob\
Remarks: Unrestrictive license along the lines of MIT\
Used for unit-tests\
License: ISC

Name: Typescript\
URL: https://github.com/microsoft/TypeScript\
Remarks:\
License: Apache-2.0

Name: mocha\
URL: https://github.com/mochajs/mocha\
Remarks:\
License: MIT

Name: ts-loader\
URL: https://github.com/TypeStrong/ts-loader\
Remarks:\
License: MIT

Name: webpack\
URL: https://github.com/webpack/webpack\
Remarks:\
License: MIT

Name: webpack-cli\
URL: https://github.com/webpack/webpack-cli\
Remarks:\
License: MIT

Name: webpack\
URL: https://github.com/Microsoft/vscode-test\
Remarks:\
License: MIT
