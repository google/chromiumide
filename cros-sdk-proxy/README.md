# CrOS SDK Proxy

CrOS SDK Proxy allows you to connect to CrOS chroot by SSH
without exposing any network ports.

## Installation

**Outside** of Chrome OS chroot on your development workstation which contains
the source tree, run the following commands.

```shell
CROS_ROOT=~/chromiumos/  # Your Chromium OS source code root
cd ${CROS_ROOT}/chromite/ide_tooling/cros-sdk-proxy

# Binary goes to ~/go/bin/cros-sdk-proxy.
go build -o ~/go/bin/cros-sdk-proxy ./cmd/cros-sdk-proxy
```

## Setting up SSH config for local access

If you run the VSCode client on your development workstation, add the following
entry to `~/.ssh/config`, **replacing CROS_ROOT**.

```
Host cros
ProxyCommand ~/go/bin/cros-sdk-proxy enter --root=CROS_ROOT
StrictHostKeyChecking no
UserKnownHostsFile /dev/null
```

- Replace `CROS_ROOT` with the path to the root directory of your CrOS source code
  checkout.

Then you can connect to chroot by `ssh cros`.

## Setting up SSH config for remote access

If you run the VSCode client on a remote client machine, add the following entry
to `~/.ssh/config` **on the remote client machine which runs VSCode** (not on the
development workstation), **replacing DEV_HOST and CROS_ROOT**.

```
Host cros
ProxyCommand ssh DEV_HOST ~/go/bin/cros-sdk-proxy enter --root=CROS_ROOT
StrictHostKeyChecking no
UserKnownHostsFile /dev/null
```

- Replace `DEV_HOST` with the host name of the development workstation.
  Password-less SSH access (with ssh-agent, gcert, or something else) to the
  workstation should be configured in advance.
- Replace `CROS_ROOT` with the **absolute** path to the root directory of your
  CrOS source code checkout.

Then you can connect to chroot by `ssh cros`.
