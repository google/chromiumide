# Modern IDE quickstart (go/cros-ide-quickstart)

## Prerequisites

Follow the [Chromium OS Developer Guide] and set up development environment.
Especially [entering the chroot via cros_sdk] must be possible.

[Chromium OS Developer Guide]: https://chromium.googlesource.com/chromiumos/docs/+/HEAD/developer_guide.md#chromium-os-developer-guide
[entering the chroot via cros_sdk]: https://chromium.googlesource.com/chromiumos/docs/+/HEAD/developer_guide.md#Enter-the-chroot

## Installation

Complete the following process, and you get the modern IDE!

### 1. Install VSCode

Follow the internal guide of [installing VSCode](https://g3doc.corp.google.com/devtools/editors/vscode/g3doc/install.md?cl=head).

### 2. Install cros-sdk-proxy

Follow [../cros-sdk-proxy/README.md](../cros-sdk-proxy/README.md).

  TODO(oka): Automate installation of the proxy.

### 3. Connect to chroot via VSCode

Install [Remote development] extension on the VSCode.
Select SSH target `cros` and open your working directory under
`/home/$USER/chromiumos/`.

[Remote development]: https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.vscode-remote-extensionpack

### 4. Install the extension

Open terminal in the VSCode connected to `cros`, and run

```
~/chromiumos/chromite/ide_tooling/cros-ide/install.sh
```

  TODO(oka): Publish the extension to official marketplace to ease installation.

### 5. That's it!
