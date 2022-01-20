# vs-plugin README

Currently ***EXPERIMENTAL*** only. No timely support will be provided

This plugin consolidates commonly used tools for Chromium OS Development.

## Getting Started with Development

* Run `npm start` to install required modules
* There are two preconfigured run configurations
  * `Run Extension` launches up a new vsCode window and starts up the cros-ide. This plugin is displayed as an icon on the side shelf
  * `Extension Tests` kicks off tests

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
Version: N/A\
Remarks: Pulls in TS data-types published via DefinitelyTyped (i.e. @types/*)\
License: MIT

Name: typescript-eslint\
URL: https://github.com/typescript-eslint/typescript-eslint/\
Version: 5.1.0\
Remarks:\
License: BSD-2-Clause

Name: eslint\
URL: https://github.com/eslint/eslint\
Version: 8.7.0\
Remarks:\
License: MIT

Name: glob\
URL: https://github.com/isaacs/node-glob\
Version: 7.1.7\
Remarks: Unrestrictive license along the lines of MIT\
Used for unit-tests\
License: ISC

Name: Typescript\
URL: https://github.com/microsoft/TypeScript\
Version: 4.5.5\
Remarks:\
License: Apache-2.0

Name: mocha\
URL: https://github.com/mochajs/mocha\
Version: 9.1.3\
Remarks:\
License: MIT

Name: ts-loader\
URL: https://github.com/TypeStrong/ts-loader\
Version: 9.2.5\
Remarks:\
License: MIT

Name: webpack\
URL: https://github.com/webpack/webpack\
Version: 5.52.1\
Remarks:\
License: MIT

Name: webpack-cli\
URL: https://github.com/webpack/webpack-cli\
Version: 5.52.1\
Remarks:\
License: MIT

Name: webpack\
URL: https://github.com/Microsoft/vscode-test\
Version: 1.6.2\
Remarks:\
License: MIT
