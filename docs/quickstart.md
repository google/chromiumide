# CrOS IDE quickstart (go/cros-ide-quickstart)

CrOS IDE is a VSCode Extension for ChromiumOS development. It is a new project
and we currently support only internal developers at Google.

If you are using CrOS IDE <= v0.0.10, follow [legacy quickstart]. Note that
legacy support will be removed after global dogfood release.

[legacy quickstart]: ./legacy-quickstart.md

## Prerequisites

All you need is a ChromiumOS chroot, which most developers already have.
If you don't have it, please follow the [ChromiumOS Developer Guide] and set up
your development environment, so you can [enter the chroot via cros_sdk].

In this document, we assume ChromiumOS source code is in `~/chromiumos`.

[chromiumos developer guide]: https://chromium.googlesource.com/chromiumos/docs/+/HEAD/developer_guide.md
[enter the chroot via cros_sdk]: https://chromium.googlesource.com/chromiumos/docs/+/HEAD/developer_guide.md#Enter-the-chroot

## 1. Install Visual Studio Code

First, you need to install Visual Studio Code (VSCode) on your client machine.

### gLinux

```
sudo apt install code
```

Learn more at [go/vscode/install#glinux]

[go/vscode/install#glinux]: http://go/vscode/install#glinux

### gMac

Install [VSCode from the Software Center] or [go/mule]
(`sudo mule install visual-studio-code`).

[vscode from the software center]: http://go/softwarecenter/list//appid%3AMAC_OS-visual-studio-code/MAC_OS
[go/mule]: http://go/mule

### ChromeOS

CrOS IDE supports only platform-specific VSCode, which is not available for
ChromeOS. There are two workarounds:

- Check out [go/cros-ide-on-chromebooks] to learn more about
  [Code Server], which is a Web IDE accessible in the browser.
- Use Chrome Remote Desktop.

[go/cros-ide-on-chromebooks]: http://go/cros-ide-on-chromebooks
[code server]: https://github.com/coder/code-server

## 2. (Optional) Connect to your machine via VSCode

If you use remote setup, for example gMac laptop, you will need [Remote development] extension.

Install [Remote development] extension on the VSCode.
Click the lower left "Open a Remote Window" button and select \[Connect to
Host...\] command (alternatively directly choose this command from the command
palette), select your remote machine, and open your working directory under `~/chromiumos/`.

[remote development]: https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.vscode-remote-extensionpack

## 3. Install the extension

Open terminal in the VSCode and run

```
~/chromiumos/chromite/ide_tooling/cros-ide/install.sh
```

### Additional installation options

- In case you are using code-server or VSCode Insiders, specify the VSCode executable with
  `--exe` flag. For example

```
~/chromiumos/chromite/ide_tooling/cros-ide/install.sh --exe ~/.local/bin/code-server
```

- You can install an old version of the extension (say 0.0.1), with the `--force 0.0.1` flag.

## 4. Reload the IDE

You need to reload the VSCode to activate the extension. Either simply restart
the IDE, or open the command palette (Ctrl+Shift+P) and type "Developer: Reload
Window".

## Updating

Run the install script again as written in [Install the
extension](#3_install-the-extension) and [reload the IDE](#4_reload-the-ide).

# Features

### Code Completion and Navigation

Code completion in C++ is available in platform2 packages which support
`USE=compdb_only`. Press F12 to [Go to Definition], Ctrl+F12 to
Go to Implementation, and so on.

![Example of Code Completion](https://storage.googleapis.com/chromeos-velocity/ide/img/code-completion.gif)

[go to definition]: https://code.visualstudio.com/docs/editor/editingevolved#_go-to-definition

### Linter Integration

CrOS IDE exposes lint errors found by `cros lint` and similar tools in C++,
Python, shell, and GN files. We run linters every time a file is saved,
and mark errors with squiggly lines in the editor and show them in
the _Problems_ box and on mouse hover. This feature bring to your attention
errors which block `repo upload`.

![Lint Errors in the IDE](https://storage.googleapis.com/chromeos-velocity/ide/img/lint-virtual.png)

### Boards and Packages

CrOS IDE shows which packages you are working on and lets you run
`cros_workon start/stop` directly from the UI. Access it by clicking on
_CrOS Development_ [activity bar]. Use +/– buttons to start and stop working
on packages.

![Boards and Packages in the IDE](https://storage.googleapis.com/chromeos-velocity/ide/img/boards-and-packages.gif)

[activity bar]: https://code.visualstudio.com/docs/getstarted/userinterface

### Code Search

You can easily open the current file in Code Search from the context menu in
a text editor. Go to [settings] to choose whether to chose which instance
to use (public, internal, or Gitiles).

![Code Search integration](https://storage.googleapis.com/chromeos-velocity/ide/img/code-search.gif)

[settings]: https://code.visualstudio.com/docs/getstarted/settings
