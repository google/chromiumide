# Change Log

## 0.52.0

- Java: Include implementations in Find References for interface methods

## 0.50.0 (January 2026)

- Fix Java format issues

## 0.48.0 (January 2026)

- Enable Java debugger by default
- Support C++ unit test execution in Clank

## 0.46.0 (June 2025)

- Chromium
  - Fix gcert checks to not check SSH certs
- Chromium Java
  - Handle broken blocks properly
  - Ensure depot\_tools is in $PATH
  - Fix undeterministic test failures for missing depot\_tools
- CrOS
  - Enable CrOS features conditionally
  - Enable format commands only on supported CrOS repositories
- Misc
  - Remove gn feature

## 0.44.0 (May 2025)

- Chromium Java
  - Support Chromium API endpoint
  - Fix crash on autoimporting
- Misc
  - Windows: output directory handling
  - GN: Recommend google.gn instead of msedge-dev.gnls

## 0.42.0 (May 2025)

- Chromium Java
  - Fix build issues on recent Chromium checkouts

## 0.40.1 (May 2025)

- Chromium Java
  - Fix startup issues on recent Chromium checkouts

## 0.40.0 (April 2025)

- Chromium Java
  - Fix build issues on recent Chromium checkouts

## 0.38.0 (April 2025)

- Chromium Java
  - Fix auto-import order for static imports
  - Fix incorrect auto-importing classes in the same package
- Gerrit
  - Support SSO authentication
- Boards and packages
  - Use "cros workon" instead of "cros\_workon"

## 0.36.0 (March 2025)

- Chromium Java support
- Link file paths on the terminal output.

## 0.34.0 (June 2024)

- Cros format
  - Honor .presubmitignore and PRESUBMIT.cfg
  - Suggest to use chromiumide as default formatter
  - Add a command to force-format
- Lint
  - Honor PRESUBMIT.cfg
- Ebuild
  - Refactor to use LSP
- Boards and packages
  - Add command to build package with flags
  - Add command to SSH with flags
  - Add command to build image
- UI
  - Use different color for error icon
  - Increase default board status item discoverability when not set

## 0.32.0 (May 2024)

- C++ xrefs
  - Chromium
  - Kernel
- Code server support deprecation
- Boards and packages
  - Enable build command by default
  - Rename command titles
  - Add help icon
- Gerrit
  - Bug fix on comment edit
  - chromium: set environment variable properly on calling git cl so that the issue b/341097070
    doesn't happen
- Gcert
  - Add command to run gcert, and add a button to run the command on several error messages.

## 0.30.0 (May 2024)

- DUT management
  - Various bug fixes on seamless deployment
  - Stop using pinned version of crosfleet by default
- Logging
  - Log the current directory and the modified or allowlisted environment variables on running
    commands
- Format
  - Formatting now works on all file types supported by cros format command (but will skip
    files matching .presubmitignore)

## 0.28.0 (April 2024) - skipped

- DUT management
  - Seamless deployment: automatic image compatibility check on extension activation, adding new device, deploying package and prompt to flash device with images from a suggested list

## 0.26.0 (January 2024)

- Chromium
  - Fixed Chromium repository detection when .gclient strings are unicoded
- DUT management
  - New feature: click to deploy package
  - Easier image flashing with Chrome milestones list
  - Device attributes (board, model, builder path) are now shown as sub-items
- ChromiumOS build
  - Suggests autoseting cpu governor for build_packages command

## 0.24.0 (November 2023)

- Chromium
  - DIR_METADATA file support
- Ebuild and eclass file support
  - Links to src code from CROS_WORKON_LOCAL_NAME and CROS_WORKON_SUBTREE
  - Links to inherited eclass
  - Tooltip for portage and eclass variables and functions
- DUT management
  - Flashing with non-release (local, postsubmit, cq, snapshot) images

## 0.22.0 (September 2023)

- Boards and packages view V2
  - All the packages are shown in hierarchy
  - The package for an active file is automatically revealed
  - You can add category or package items to favorite for them to be shown first
- Gerrit integration
  - Chromium repository
  - Editing and discarding draft comments
- Tast tests
  - Debugging Tast tests

## 0.20.0 (August 2023)

- GTest
  - Various bug fixes
- Chromium
  - Show full error message on gn.args parse failure
- Metrics
  - Record active users count
- ChromiumIDE development
  - Improve build speed
  - Use node 16

## 0.18.0 (July 2023)

- Chromium
  - Add gtest runner for Chromium.
- Device managements
  - Support rotated VNC session.
- Gerrit integration
  - Fix failure to get Gerrit account info.
- Tast tests
  - Add settings to set extra args on running Tast tests.
- Xrefs
  - Add a context menu to regenerate compilation database.
  - Fix the issue of compilation database not generated for camera/features and camera/gpu.

## 0.16.0 (June 2023)

- Migrate cros-ide* configs and commands to chromiumide* .
- Migrate metrics to GA4.
- Fix broken regex for the button to run tast tests.

## 0.14.1 (June 2023)

- Bump the minimum VSCode version to 1.75.1.
- Rebrand to ChromiumIDE.
- Various stability improvements
  - Fix gnlint breakage
  - Fix compilation error on hermes package
  - Stop repeatedly running failed compilation command
  - Improve error messages on SSH connection failure
  - Use partner testing rsa if available
  - Correct the working directory for running gtest

## 0.12.0 (April 2023)

- Gerrit integration
  - Various stability bug fixes.
  - Reply support.
- Chromium support
  - Output directory management.
  - Links in OWNERS file.
  - Boilerplate insertion for .cc and .h files.

## 0.10.0 (March 2023)

- Fix for duplicated Gerrit comments.
- Fixes for some lint warnings in shellscripts.

## 0.8.0 (February 2023)

- Gerrit integration
  - Internal repositories are supported
  - Draft comments are now visible from the IDE
  - Links to Gerrit pages are added on comment threads
- Log viewer for test devices

## 0.6.0 (December 2022)

- Gerrit integration (readonly)
- Platform2 unit tests support

## 0.4.0 (November 2022)

- Fixes for features crashing outside ChromeOS source tree.
- Run the spellchecker on commit messages.

## 0.2.0 (October 2022)

- **Announced global dogfooding**

## 0.1.1 (October 4, 2022)

- Run Tast tests
- Initial xrefs support for platform/ec

## 0.1.0 (September 2022)

- **Installation from the Marketplace**
- Automatically adding CrOS license headers
- Spellchecker (same as in Tricium)
- Device manager improvements: remaining lease time time, abandoning leases, etc.

## 0.0.14 (August 2022)

- Leasing test devices from crosfleet with VNC and SSH access
- Go linter
- C++ xrefs support for generated files

## 0.0.13 (July 2022)

- GN autoformatting
- Access ebuilds from boards and packages
- Bugfixes in C++ xrefs and UI

## 0.0.11 (June 2022)

- The extension works outside the chroot (simplified installation).
- Faster and more stable C++ support in `platform2`.
- VNC and SSH from the IDE to developer owned test devices.
- Syntax highlighting for Upstart.

## 0.0.10 (May 2022)

- Status bar item to access IDE logs.
- Suggestions for 3rd party extensions.
- Usage metrics.

## Initial Dogfood Release (March 2022)

- Autocompletion, cross references, and symbol definitions for C++ in `platform2`.
- Linting (C++, Python, Shell, GN).
- Read-only view for boards and packages worked on.
- Code Search integration.
- Google-internal links (crbug/, b/, and so on).
