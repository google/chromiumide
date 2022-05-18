# Developers guide

## Initial set up and testing

1. Follow the [QuickStart Guide], skip installing the extension. Open the `cros-ide` directory as
   your working directory.
2. Run `npm ci` in the `cros-ide` directory (inside chroot).
3. _Outside chroot_ (open a different terminal), run `npm test` in the `cros-ide` directory to
   confirm tests pass. `node --version` should return v14.\* for the test to pass. To install the
   proper version, you may use [nvm].

[quickstart guide]: https://chromium.googlesource.com/chromiumos/chromite/+/HEAD/ide_tooling/docs/quickstart.md
[nvm]: https://github.com/nvm-sh/nvm

## Testing

There are several ways of testing.

- Testing from GUI
  - Make sure your VSCode is connected to chroot, and opening `cros-ide` as a
    workspace.
  - (See [Debugging the tests] for visual guide)
    Click the "Run and Debug" icon in the [Activity Bar], select "Run Extension"
    menu, and click the "Start Debugging" button or press F5. It should launch a new window
    where the extension built from the source code is installed. Then you can
    perform whatever manual tests on it. By default, other extensions are disabled. To keep other
    extensions running, choose "Run Extension (keep other extensions running)".
  - Similarly, you can select "Extension Tests" instead of "Run Extensions" to run all the tests.
    The output will be shown in the Debug Console in the IDE used to develop the extension
- Testing from command line
  - `npm test` runs all the tests. It must be run outside chroot.
  - `npm preupload` runs all the tests and linters. It must be run outside chroot.

[activity bar]: https://code.visualstudio.com/api/references/extension-guidelines#view-containers
[debugging the tests]: https://code.visualstudio.com/api/working-with-extensions/testing-extension#debugging-the-tests

## Publishing the extension

Here is the steps to release a new version of a package file, to be installed by all users by
`./install.sh`.

1. Upload a patch that updates the version in `package.json`, have it reviewed, approved and merged
   to `cros/main` (for example, http://crrev.com/c/3474259)
2. Check out that commit in the local git checkout.
3. Inside chroot, run `./install.sh --upload`. It will build the extension and upload it to Cloud
   Storage under [chromeos-velocity].

[chromeos-velocity]: https://pantheon.corp.google.com/storage/browser?project=google.com:chromeos-velocity

## Hiding features under development

Incomplete features can be hidden. We do this by introducting configurations settings,
which are false by default, and using them to guard `activate` function and UI elements
with `when` clauses. See http://crrev.com/c/3499666 for an example.

To enable a features go to File > Preference > Settings (Ctrl+,) and then
Extensions > CrOS (CrOS IDE must be activated first). After enabling a feature, run
'Developer: Reload Window' (Ctrl+R) to make sure it is loaded correctly.

## Coding styles

We follow [Google TypeScript style guide].

This project contains configurations for [ESLint] and [Prettier] derived from
[GTS]. Install [ESLint extension] and [Prettier extension] to your VSCode to
see lint errors in real-time and format on save. From command lines, you can
run `npm run lint` to check lint errors, and `npm run fix` to fix many of them
automatically.

Note that we have slight deviations from [Google TypeScript style guide]:

- Function parameters with a leading underscore can be unused. Google TS style
  team is about to allow them ([b/173108529]).
- Indentation style is a bit different (e.g. 2-space indentation for continued
  lines). This difference comes from the fact that GTS uses Prettier as the
  code formatter, in contrast to clang-format used within Google. After all,
  TS style guide is replacing written formatting rules with recommendation to
  rely on code formatters ([cl/433269475]).

[google typescript style guide]: http://go/ts-style
[eslint]: https://eslint.org/
[prettier]: https://prettier.io/
[eslint extension]: https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint
[prettier extension]: https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode
[gts]: https://github.com/google/gts
[b/173108529]: http://b/173108529
[cl/433269475]: http://cl/433269475

## FAQs

- How to check that my VSCode is connected to chroot?
  - In the lower left corner, it should show `SSH: cros` if you followed
    [QuickStart Guide].
- How to build and install the extension from local source code?
  - Run `./install.sh --dev` in the terminal of the VSCode connected to chroot.
    It builds from the source code and installs it to the current vscode.
- Why repo upload is slow?
  - It runs `npm preupload`. It's a tentative alternative for a CQ which is under
    construction.
- My repo hook script complains that there is no npx?
  - Run `sudo apt-get install npm` (outside of chroot).
- How to fix formatting errors?
  - Run `npm run fix`.

---

# Sticky Notes

- [Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)
- [Project Documentation (Google Internal)](http://go/cros-ide)

---
