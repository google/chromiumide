// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

import * as commonUtil from './common/common_util';
import * as ideUtilities from './ide_utilities';

export function activate(context: vscode.ExtensionContext) {
  const compildationDatabase = new CompilationDatabase();

  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(
      editor => {
        if (editor?.document.languageId === 'cpp') {
          compildationDatabase.generate(editor.document);
        }
      },
  ));

  // Update compilation database when a GN file is updated.
  context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(
      document => {
        if (document.fileName.match(/\.gni?$/)) {
          compildationDatabase.generate(document);
        }
      },
  ));

  const document = vscode.window.activeTextEditor?.document;
  if (document) {
    compildationDatabase.generate(document);
  }
}

export interface PackageInfo {
  sourceDir: string, // directory containing source code relative to chromiumos/
  pkg: string, // package name
}

const MNT_HOST_SOURCE = '/mnt/host/source'; // realpath of ~/chromiumos

class CompilationDatabase {
  private enabled = true;
  private readonly manager = new commonUtil.JobManager<void>();

  constructor() {}

  // Generate compilation database for clangd.
  // TODO(oka): Add unit test.
  async generate(document: vscode.TextDocument) {
    if (!this.enabled) {
      return;
    }
    const packageInfo = await getPackage(document.fileName);
    if (!packageInfo) {
      return;
    }
    const {sourceDir, pkg} = packageInfo;

    const board = await ideUtilities.getOrSelectTargetBoard();
    if (!board) {
      return;
    }

    // Below, we create compilation database based on the project and the board.
    // Generating the database is time consuming involving execution of external
    // processes, so we ensure it to run only one at a time using the manager.
    await this.manager.offer(async () => {
      if (!this.enabled) {
        return; // early return from queued job.
      }
      try {
        const {shouldRun, userConsent} = await shouldRunCrosWorkon(board, pkg);
        if (shouldRun && !userConsent) {
          return;
        }
        if (shouldRun) {
          await commonUtil.exec('cros_workon', ['--board', board, 'start', pkg],
              ideUtilities.getLogger().append);
        }

        const {error} = await runEmerge(board, pkg);
        if (error !== undefined) {
          vscode.window.showErrorMessage(error);
          return;
        }

        const filepath =
          `/build/${board}/build/compilation_database/${pkg}/compile_commands_chroot.json`;
        if (!fs.existsSync(filepath)) {
          const dismiss = 'Dismiss';
          const dialog = vscode.window.showErrorMessage('Compilation database not found. ' +
            `Configure ${pkg} to generate it. Example: https://crrev.com/c/2909734`, dismiss);
          const answer = await commonUtil.withTimeout(dialog, 30 * 1000);
          if (answer === dismiss) {
            this.enabled = false;
          }
          return;
        }

        // Make the generated compilation database available from clangd.
        await commonUtil.exec(
            'ln', ['-sf', filepath, path.join(MNT_HOST_SOURCE, sourceDir, 'compile_commands.json')],
            ideUtilities.getLogger().append);
      } catch (e) {
        // TODO(oka): show error message for user to manually resolve problem
        // (e.g. compile error).
        ideUtilities.getLogger().appendLine((e as Error).message);
        console.error(e);
      }
    });
  }
}

async function workonList(board: string): Promise<string[]> {
  const out = await commonUtil.exec('cros_workon', ['--board', board, 'list']);
  return out.split('\n').filter(x => x !== '');
}

export type PersistentConsent = 'Never' | 'Always'
export type UserConsent = PersistentConsent | 'Once';
export type UserChoice = PersistentConsent | 'Yes'

const NEVER: PersistentConsent = 'Never';
const ALWAYS: PersistentConsent = 'Always';
const YES: UserChoice = 'Yes';

async function getUserConsent(current: UserConsent, ask: () => Thenable<UserChoice | undefined>):
    Promise<{ok: boolean, remember?: PersistentConsent}> {
  switch (current) {
    case NEVER:
      return {ok: false};
    case ALWAYS:
      return {ok: true};
  }
  const choice = await ask();
  switch (choice) {
    case YES:
      return {ok: true};
    case NEVER:
      return {ok: false, remember: NEVER};
    case ALWAYS:
      return {ok: true, remember: ALWAYS};
    default:
      return {ok: false};
  }
}

const AUTO_CROS_WORKON_CONFIG = 'clangdSupport.crosWorkonPrompt';

/**
 * Returns whether to run cros_workon start for the board and pkg. If the package is already being
 * worked on, it returns shouldRun = false. Otherwise, in addition to shouldRun = true, it tries
 * getting user consent to run the command and fills userConsent.
 */
async function shouldRunCrosWorkon(board: string, pkg: string): Promise<{
  shouldRun: boolean,
  userConsent?: boolean,
}> {
  if ((await workonList(board)).includes(pkg)) {
    return {
      shouldRun: false,
    };
  }

  const currentChoice = ideUtilities.getConfigRoot().get<UserConsent>(
      AUTO_CROS_WORKON_CONFIG) || 'Once';

  const showPrompt = async () => {
    // withTimeout makes sure showPrompt returns. showInformationMessage doesn't resolve nor reject
    // if the prompt is dismissed due to timeout (about 15 seconds).
    const choice = await commonUtil.withTimeout(
        vscode.window.showInformationMessage(`Generating cross references requires 'cros_workon ` +
        `--board=${board} start ${pkg}'. Proceed?`, {}, YES, ALWAYS, NEVER),
        30 * 1000,
    );
    return choice as UserChoice | undefined;
  };
  const {ok, remember} = await getUserConsent(currentChoice, showPrompt);
  if (remember) {
    ideUtilities.getConfigRoot().update(AUTO_CROS_WORKON_CONFIG, remember,
        vscode.ConfigurationTarget.Global);
  }
  return {
    shouldRun: true,
    userConsent: ok,
  };
}

/** Runs emerge and shows a spinning progress indicator in the status bar. */
function runEmerge(board: string, pkg: string): Thenable<{error?: string}> {
  return vscode.window.withProgress({
    location: vscode.ProgressLocation.Window,
    title: `Building refs for ${pkg}`,
    cancellable: false,
  }, (progress, token) => {
    async function f() {
      try {
        await commonUtil.exec('env',
            ['USE=compilation_database', `emerge-${board}`, pkg],
            ideUtilities.getLogger().append, {logStdout: true});
        return {};
      } catch (error) {
        // TODO(b/223534220): Use error after the error message becomes useful.
        return {error: `emerge-${board} ${pkg} failed`};
      }
    };
    return f();
  });
}

// Known source code location to package name mapping which supports
// compilation database generation.
// TODO(oka): automatically generate this list when the extension is activated.
const KNOWN_PACKAGES: Array<PackageInfo> = [
  ['src/aosp/frameworks/ml', 'chromeos-base/aosp-frameworks-ml-nn'],
  ['src/aosp/frameworks/ml/chromeos/tests', 'chromeos-base/aosp-frameworks-ml-nn-vts'],
  ['src/platform2/arc/adbd', 'chromeos-base/arc-adbd'],
  ['src/platform2/arc/apk-cache', 'chromeos-base/arc-apk-cache'],
  ['src/platform2/arc/container/appfuse', 'chromeos-base/arc-appfuse'],
  ['src/platform2/arc/container/obb-mounter', 'chromeos-base/arc-obb-mounter'],
  ['src/platform2/arc/container/sdcard', 'chromeos-base/arc-sdcard'],
  ['src/platform2/arc/data-snapshotd', 'chromeos-base/arc-data-snapshotd'],
  ['src/platform2/arc/mount-passthrough', 'chromeos-base/mount-passthrough'],
  ['src/platform2/arc/setup', 'chromeos-base/arc-setup'],
  ['src/platform2/arc/vm/boot_notification_server', 'chromeos-base/arcvm-boot-notification-server'],
  ['src/platform2/arc/vm/forward-pstore', 'chromeos-base/arcvm-forward-pstore'],
  ['src/platform2/arc/vm/host_clock', 'chromeos-base/arc-host-clock-service'],
  ['src/platform2/arc/vm/libvda', 'chromeos-base/libvda'],
  ['src/platform2/arc/vm/mojo_proxy', 'chromeos-base/arcvm-mojo-proxy'],
  ['src/platform2/arc/vm/sensor_service', 'chromeos-base/arc-sensor-service'],
  ['src/platform2/attestation', 'chromeos-base/attestation'],
  ['src/platform2/attestation/client', 'chromeos-base/attestation-client'],
  ['src/platform2/authpolicy', 'chromeos-base/authpolicy'],
  ['src/platform2/biod', 'chromeos-base/biod'],
  ['src/platform2/biod/biod_proxy', 'chromeos-base/biod_proxy'],
  ['src/platform2/bootid-logger', 'chromeos-base/bootid-logger'],
  ['src/platform2/bootstat', 'chromeos-base/bootstat'],
  ['src/platform2/buffet', 'chromeos-base/buffet'],
  ['src/platform2/camera/android', 'chromeos-base/cros-camera-android-deps'],
  ['src/platform2/camera/camera3_test', 'media-libs/cros-camera-test'],
  ['src/platform2/camera/common', 'chromeos-base/cros-camera-libs'],
  ['src/platform2/camera/common/jpeg/libjda_test', 'media-libs/cros-camera-libjda_test'],
  ['src/platform2/camera/common/jpeg/libjea_test', 'media-libs/cros-camera-libjea_test'],
  ['src/platform2/camera/common/libcab_test', 'media-libs/cros-camera-libcab-test'],
  ['src/platform2/camera/common/libcamera_connector_test',
    'media-libs/cros-camera-libcamera_connector_test'],
  ['src/platform2/camera/features/document_scanning',
    'media-libs/cros-camera-document-scanning-test'],
  ['src/platform2/camera/features/hdrnet/tests', 'media-libs/cros-camera-hdrnet-tests'],
  ['src/platform2/camera/gpu/tests', 'media-libs/cros-camera-gpu-test'],
  ['src/platform2/camera/hal_adapter', 'chromeos-base/cros-camera'],
  ['src/platform2/camera/hal/ip', 'media-libs/cros-camera-hal-ip'],
  ['src/platform2/camera/hal/usb', 'media-libs/cros-camera-hal-usb'],
  ['src/platform2/camera/hal/usb/tests', 'media-libs/cros-camera-usb-tests'],
  ['src/platform2/camera/hal/usb/v4l2_test', 'media-libs/cros-camera-v4l2_test'],
  ['src/platform2/camera/tools/connector_client', 'media-libs/cros-camera-connector-client'],
  ['src/platform2/camera/tools/cros_camera_tool', 'chromeos-base/cros-camera-tool'],
  ['src/platform2/camera/tools/generate_camera_profile', 'media-libs/arc-camera-profile'],
  ['src/platform2/cfm-dfu-notification', 'chromeos-base/cfm-dfu-notification'],
  ['src/platform2/chaps', 'chromeos-base/chaps'],
  ['src/platform2/chromeos-common-script', 'chromeos-base/chromeos-common-script'],
  ['src/platform2/chromeos-dbus-bindings', 'chromeos-base/chromeos-dbus-bindings'],
  ['src/platform2/chromiumos-wide-profiling', 'chromeos-base/quipper'],
  ['src/platform2/client_id', 'chromeos-base/client_id'],
  ['src/platform2/codelab', 'chromeos-base/codelab'],
  ['src/platform2/crash-reporter', 'chromeos-base/crash-reporter'],
  ['src/platform2/cros-disks', 'chromeos-base/cros-disks'],
  ['src/platform2/crosdns', 'chromeos-base/crosdns'],
  ['src/platform2/croslog', 'chromeos-base/croslog'],
  ['src/platform2/cryptohome', 'chromeos-base/cryptohome'],
  ['src/platform2/cryptohome/bootlockbox-client', 'chromeos-base/bootlockbox-client'],
  ['src/platform2/cryptohome/client', 'chromeos-base/cryptohome-client'],
  ['src/platform2/cryptohome/dev-utils', 'chromeos-base/cryptohome-dev-utils'],
  ['src/platform2/cups_proxy', 'net-print/cups_proxy'],
  ['src/platform2/debugd', 'chromeos-base/debugd'],
  ['src/platform2/debugd/client', 'chromeos-base/debugd-client'],
  ['src/platform2/dev-install', 'chromeos-base/dev-install'],
  ['src/platform2/diagnostics', 'chromeos-base/diagnostics'],
  ['src/platform2/diagnostics/dpsl', 'chromeos-base/diagnostics-dpsl-test'],
  ['src/platform2/diagnostics/grpc', 'chromeos-base/wilco-dtc-grpc-protos'],
  ['src/platform2/disk_updater', 'chromeos-base/disk_updater'],
  ['src/platform2/dlcservice', 'chromeos-base/dlcservice'],
  ['src/platform2/dlcservice/client', 'chromeos-base/dlcservice-client'],
  ['src/platform2/dlp', 'chromeos-base/dlp'],
  ['src/platform2/dns-proxy', 'chromeos-base/dns-proxy'],
  ['src/platform2/easy-unlock', 'chromeos-base/easy-unlock'],
  ['src/platform2/featured', 'chromeos-base/featured'],
  ['src/platform2/federated', 'chromeos-base/federated-service'],
  ['src/platform2/feedback', 'chromeos-base/feedback'],
  ['src/platform2/fitpicker', 'sys-apps/fitpicker'],
  ['src/platform2/foomatic_shell', 'chromeos-base/foomatic_shell'],
  ['src/platform2/fusebox', 'chromeos-base/fusebox'],
  ['src/platform2/glib-bridge', 'chromeos-base/glib-bridge'],
  ['src/platform2/goldfishd', 'chromeos-base/goldfishd'],
  ['src/platform2/hammerd', 'chromeos-base/hammerd'],
  ['src/platform2/hardware_verifier', 'chromeos-base/hardware_verifier'],
  ['src/platform2/hardware_verifier/proto', 'chromeos-base/hardware_verifier_proto'],
  ['src/platform2/hps', 'chromeos-base/hpsd'],
  ['src/platform2/hps/util', 'chromeos-base/hps-tool'],
  ['src/platform2/hwsec-test-utils', 'chromeos-base/hwsec-test-utils'],
  ['src/platform2/iioservice/daemon', 'chromeos-base/iioservice'],
  ['src/platform2/iioservice/iioservice_simpleclient', 'chromeos-base/iioservice_simpleclient'],
  ['src/platform2/iioservice/libiioservice_ipc', 'chromeos-base/libiioservice_ipc'],
  ['src/platform2/image-burner', 'chromeos-base/chromeos-imageburner'],
  ['src/platform2/imageloader', 'chromeos-base/imageloader'],
  ['src/platform2/imageloader/client', 'chromeos-base/imageloader-client'],
  ['src/platform2/init', 'chromeos-base/chromeos-init'],
  ['src/platform2/installer', 'chromeos-base/chromeos-installer'],
  ['src/platform2/kerberos', 'chromeos-base/kerberos'],
  ['src/platform2/libbrillo', 'chromeos-base/libbrillo'],
  ['src/platform2/libchromeos-ui', 'chromeos-base/libchromeos-ui'],
  ['src/platform2/libcontainer', 'chromeos-base/libcontainer'],
  ['src/platform2/libec', 'chromeos-base/libec'],
  ['src/platform2/libhwsec-foundation', 'chromeos-base/libhwsec-foundation'],
  ['src/platform2/libhwsec', 'chromeos-base/libhwsec'],
  ['src/platform2/libipp', 'chromeos-base/libipp'],
  ['src/platform2/libmems', 'chromeos-base/libmems'],
  ['src/platform2/libpasswordprovider', 'chromeos-base/libpasswordprovider'],
  ['src/platform2/libtpmcrypto', 'chromeos-base/libtpmcrypto'],
  ['src/platform2/login_manager', 'chromeos-base/chromeos-login'],
  ['src/platform2/login_manager/session_manager-client', 'chromeos-base/session_manager-client'],
  ['src/platform2/lorgnette', 'chromeos-base/lorgnette'],
  ['src/platform2/marisa-trie', 'dev-libs/marisa-aosp'],
  ['src/platform2/media_perception', 'chromeos-base/mri_package'],
  ['src/platform2/mems_setup', 'chromeos-base/mems_setup'],
  ['src/platform2/metrics', 'chromeos-base/metrics'],
  ['src/platform2/midis', 'chromeos-base/midis'],
  ['src/platform2/minios', 'chromeos-base/minios'],
  ['src/platform2/missive', 'chromeos-base/missive'],
  ['src/platform2/mist', 'chromeos-base/mist'],
  ['src/platform2/ml_benchmark', 'chromeos-base/ml-benchmark'],
  ['src/platform2/ml', 'chromeos-base/ml'],
  ['src/platform2/modem-utilities', 'chromeos-base/modem-utilities'],
  ['src/platform2/modemfwd', 'chromeos-base/modemfwd'],
  ['src/platform2/mtpd', 'chromeos-base/mtpd'],
  ['src/platform2/ocr', 'chromeos-base/ocr'],
  ['src/platform2/oobe_config', 'chromeos-base/oobe_config'],
  ['src/platform2/p2p', 'chromeos-base/p2p'],
  ['src/platform2/patchpanel', 'chromeos-base/patchpanel'],
  ['src/platform2/patchpanel/dbus', 'chromeos-base/patchpanel-client'],
  ['src/platform2/patchpanel/mcastd', 'chromeos-base/mcastd'],
  ['src/platform2/patchpanel/ndproxyd', 'chromeos-base/ndproxyd'],
  ['src/platform2/pciguard', 'chromeos-base/pciguard'],
  ['src/platform2/perfetto_simple_producer', 'chromeos-base/perfetto_simple_producer'],
  ['src/platform2/permission_broker', 'chromeos-base/permission_broker'],
  ['src/platform2/permission_broker/client', 'chromeos-base/permission_broker-client'],
  ['src/platform2/policy_proto', 'chromeos-base/policy-go-proto'],
  ['src/platform2/policy_utils', 'chromeos-base/policy_utils'],
  ['src/platform2/power_manager', 'chromeos-base/power_manager'],
  ['src/platform2/power_manager/client', 'chromeos-base/power_manager-client'],
  ['src/platform2/print_tools', 'chromeos-base/print_tools'],
  ['src/platform2/regions', 'chromeos-base/regions'],
  ['src/platform2/rendernodehost', 'chromeos-base/rendernodehost'],
  ['src/platform2/rmad', 'chromeos-base/rmad'],
  ['src/platform2/run_oci', 'chromeos-base/run_oci'],
  ['src/platform2/runtime_probe', 'chromeos-base/runtime_probe'],
  ['src/platform2/screen-capture-utils', 'chromeos-base/screen-capture-utils'],
  ['src/platform2/sealed_storage', 'chromeos-base/sealed_storage'],
  ['src/platform2/secanomalyd', 'chromeos-base/secanomalyd'],
  ['src/platform2/secure_erase_file', 'chromeos-base/secure-erase-file'],
  ['src/platform2/secure-wipe', 'chromeos-base/secure-wipe'],
  ['src/platform2/shill', 'chromeos-base/shill'],
  ['src/platform2/shill/cli', 'chromeos-base/shill-cli'],
  ['src/platform2/shill/client', 'chromeos-base/shill-client'],
  ['src/platform2/shill/dbus/client', 'chromeos-base/shill-dbus-client'],
  ['src/platform2/shill/net', 'chromeos-base/shill-net'],
  ['src/platform2/sirenia/manatee-client', 'chromeos-base/manatee-client'],
  ['src/platform2/smbfs', 'chromeos-base/smbfs'],
  ['src/platform2/smbprovider', 'chromeos-base/smbprovider'],
  ['src/platform2/spaced', 'chromeos-base/spaced'],
  ['src/platform2/st_flash', 'chromeos-base/st_flash'],
  ['src/platform2/storage_info', 'chromeos-base/chromeos-storage-info'],
  ['src/platform2/syslog-cat', 'chromeos-base/syslog-cat'],
  ['src/platform2/system_api', 'chromeos-base/system_api'],
  ['src/platform2/system-proxy', 'chromeos-base/system-proxy'],
  ['src/platform2/thd', 'chromeos-base/thd'],
  ['src/platform2/timberslide', 'chromeos-base/timberslide'],
  ['src/platform2/touch_firmware_calibration', 'chromeos-base/touch_firmware_calibration'],
  ['src/platform2/touch_keyboard', 'chromeos-base/touch_keyboard'],
  ['src/platform2/tpm_manager', 'chromeos-base/tpm_manager'],
  ['src/platform2/tpm_manager/client', 'chromeos-base/tpm_manager-client'],
  ['src/platform2/tpm_softclear_utils', 'chromeos-base/tpm_softclear_utils'],
  ['src/platform2/tpm2-simulator', 'chromeos-base/tpm2-simulator'],
  ['src/platform2/trim', 'chromeos-base/chromeos-trim'],
  ['src/platform2/trunks', 'chromeos-base/trunks'],
  ['src/platform2/typecd', 'chromeos-base/typecd'],
  ['src/platform2/u2fd', 'chromeos-base/u2fd'],
  ['src/platform2/ureadahead-diff', 'chromeos-base/ureadahead-diff'],
  ['src/platform2/usb_bouncer', 'chromeos-base/usb_bouncer'],
  ['src/platform2/userspace_touchpad', 'chromeos-base/userspace_touchpad'],
  ['src/platform2/verity', 'chromeos-base/verity'],
  ['src/platform2/virtual_file_provider', 'chromeos-base/virtual-file-provider'],
  ['src/platform2/vm_tools', 'chromeos-base/vm_host_tools'],
  ['src/platform2/vm_tools/proto', 'chromeos-base/vm_protos'],
  ['src/platform2/vm_tools/sommelier', 'chromeos-base/sommelier'],
  ['src/platform2/vpn-manager', 'chromeos-base/vpn-manager'],
  ['src/platform2/webserver', 'chromeos-base/webserver'],
].map(([sourceDir, pkg]) => {
  return {
    sourceDir,
    pkg,
  };
});
Object.freeze(KNOWN_PACKAGES);

// Get information of the package that would compile the file and generates
// compilation database, or null if no such package is known.
export async function getPackage(filepath: string,
    mntHostSource: string = MNT_HOST_SOURCE): Promise<PackageInfo | null> {
  let realpath = '';
  try {
    realpath = await fs.promises.realpath(filepath);
  } catch (_e) {
    return null;
  }
  const relPath = path.relative(mntHostSource, realpath);
  if (relPath.startsWith('..') || path.isAbsolute(relPath)) {
    return null;
  }
  let res = null;
  for (const pkg of KNOWN_PACKAGES) {
    if (relPath.startsWith(pkg.sourceDir + '/') &&
      (res === null || res.sourceDir.length < pkg.sourceDir.length)) {
      res = pkg;
    }
  }
  return res;
}

export const TEST_ONLY = {
  ALWAYS, NEVER, YES,
  getUserConsent,
};
