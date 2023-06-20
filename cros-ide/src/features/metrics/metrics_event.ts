// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Exhaustive list of categories.
type Category =
  // An event triggered by an explicit user action, such as VSCode command
  // invocation.
  | 'interactive'
  // An event triggered implicitly in the background, such as lint computation.
  | 'background'
  | 'error';

// Exhaustive list of feature groups.
type FeatureGroup =
  | 'chromium.outputDirectories'
  | 'codesearch'
  | 'coverage'
  | 'cipd'
  | 'cppxrefs'
  | 'debugging'
  | 'device'
  | 'format'
  | 'gerrit'
  | 'idestatus'
  | 'lint'
  | 'misc'
  | 'owners'
  | 'package'
  | 'spellchecker'
  | 'tast'
  // 'virtualdocument' should be used in features that rely on virtual documents,
  // such as Gerrit and spellchecker, when the user interacts with such a document.
  // Event label should be chosen carefully to simplify building a dashboard
  // in Google Analytics
  | 'virtualdocument';

// Fields common to all events.
interface EventBase {
  // Describes the category this event belongs to.
  category: Category;
  // Describes the feature group this event belongs to.
  group: FeatureGroup;
  // Describes an operation the extension has just run.
  // You can optional add a prefix with a colon to group actions in the same feature set.
  // Examples:
  //   "select target board"
  //   "device: connect to device via VNC"
  description: string;
  // Name of event to be sent to GA4.
  // TODO(b/281925148): name would be a required field with checks to ensure it satisfies GA4
  // limitations
  //   1. contains alphanumerical characters or underscore '_' only,
  //   2. starts with an alphabet,
  //   3. has at most 40 characters
  // see
  // https://developers.google.com/analytics/devguides/collection/protocol/ga4/sending-events?client_type=gtag#limitations
  // Unused until switching to GA4.
  name: string;
}

interface CodesearchErrorEvent extends EventBase {
  category: 'error';
  group: 'codesearch';
  name: 'codesearch_generate_cs_path_failed';
}

interface CodesearchInteractiveEvent extends EventBase {
  category: 'interactive';
  group: 'codesearch';
  name:
    | 'codesearch_open_current_file'
    | 'codesearch_copy_current_file'
    | 'codesearch_search_selection';
}

interface CodesearchSearchSelectionEvent extends CodesearchInteractiveEvent {
  name: 'codesearch_search_selection';
  selected_text: string;
}

interface DeviceManagementEvent extends EventBase {
  category: 'interactive';
  group: 'device';
  name:
    | 'device_management_abandon_lease'
    | 'device_management_add_device'
    | 'device_management_add_existing_hosts'
    | 'device_management_add_lease'
    | 'device_management_connect_to_device_ssh'
    | 'device_management_connect_to_device_vnc'
    | 'device_management_copy_hostname'
    | 'device_management_delete_device'
    | 'device_management_flash_prebuilt_image'
    | 'device_management_log_in_to_crosfleet'
    | 'device_management_refresh_leases'
    | 'device_management_run_tast_tests'
    | 'device_management_syslog_viewer_copy'
    | 'device_management_syslog_viewer_open';
}

type GerritEvent = EventBase & {
  group: 'gerrit';
} & (
    | {
        category: 'background';
        name: 'gerrit_setting_toggled';
        flag: string;
      }
    | {
        category: 'background';
        name: 'gerrit_update_comments';
        displayed_threads_count: number;
      }
    | {
        category: 'error';
        name: 'gerrit_show_error';
      }
    | {
        category: 'interactive';
        name:
          | 'gerrit_focus_comments_panel'
          | 'gerrit_collapse_all_comment_threads';
      }
  );

interface VirtualdocumentOpenDocumentEvent extends EventBase {
  category: 'interactive';
  group: 'virtualdocument';
  name: 'virtualdocument_open_document';
  document: string;
}

interface LintErrorEvent extends EventBase {
  category: 'error';
  group: 'lint';
  name: 'lint_update_diagnostic_error' | 'lint_missing_diagnostics';
}

interface LintBackgroundEvent extends EventBase {
  category: 'background';
  group: 'lint';
}

interface LintUpdateEvent extends LintBackgroundEvent {
  name: 'lint_update';
  language_id: string;
  length: number;
}

interface LintSkipEvent extends LintBackgroundEvent {
  name: 'lint_skip';
  language_id: string;
}

interface ExtensionSuggestedEvent extends EventBase {
  category: 'background';
  group: 'misc';
  name: 'misc_suggested_extension';
  extension: string;
}

interface ExtensionInstalledEvent extends EventBase {
  category: 'interactive';
  group: 'misc';
  name: 'misc_installed_suggested_extension';
  extension: string;
}

type MiscEvent = EventBase & {
  group: 'misc';
} & (
    | {
        category: 'background';
        name: 'product_watcher_multiple_products';
      }
    | {
        category: 'interactive';
        group: 'misc';
        name: 'show_help';
      }
    | {
        category: 'error';
        name: 'misc_error_active_chromium_feature';
        feature: string;
      }
  );

interface chromiumOutputDirectoriesBackgroundEvent extends EventBase {
  category: 'background';
  group: 'chromium.outputDirectories';
  name: 'chromium_outputDirectories_built_node_cache';
  output_directories_count: number;
}

interface chromiumOutputDirectoriesErrorEvent extends EventBase {
  category: 'error';
  group: 'chromium.outputDirectories';
  name:
    | 'chromium_outputDirectories_not_a_symlink'
    | 'chromium_outputDirectories_symlink_not_linked'
    | 'chromium_outputDirectories_invalid_directory_name'
    | 'chromium_outputDirectories_race_condition_at_rebuild';
}

interface chromiumOutputDirectoriesInteractiveEvent extends EventBase {
  category: 'interactive';
  group: 'chromium.outputDirectories';
  name:
    | 'chromium_outputDirectories_edit_args_gn'
    | 'chromium_outputDirectories_refresh'
    | 'chromium_outputDirectories_change_output_directory';
}

interface PackageCrosWorkonEvent extends EventBase {
  category: 'interactive';
  group: 'package';
  name: 'package_cros_workon_start' | 'package_cros_workon_stop';
  package: string;
  board: string;
}

interface PackageOpenEbuildEvent extends EventBase {
  category: 'interactive';
  group: 'package';
  name: 'package_open_ebuild';
}

interface ActivateChromiumosEvent extends EventBase {
  category: 'error';
  group: 'misc';
  name: 'activate_chromiumos_error';
}

type CrosFormatEvent = EventBase & {group: 'format'} & (
    | {
        category: 'error';
        name: 'cros_format_call_error' | 'cros_format_return_error';
      }
    | {
        category: 'background';
        name: 'cros_format';
      }
  );

interface TargetBoardEvent extends EventBase {
  category: 'interactive';
  group: 'misc';
  name: 'select_target_board';
  board: string;
}

type CoverageEvent = EventBase &
  (
    | {
        category: 'interactive';
        group: 'coverage';
        name: 'coverage_generate' | 'coverage_show';
        board: string;
        package: string;
      }
    | {
        category: 'background';
        group: 'coverage';
        name: 'coverage_show_background';
      }
  );

type CppCodeCompletionEvent = EventBase &
  (
    | {
        category: 'background';
        group: 'cppxrefs';
        name: 'cppxrefs_generate_compdb';
        action: string;
      }
    | {
        category: 'background';
        group: 'cppxrefs';
        name: 'cppxrefs_interact_with_platform2_cpp';
      }
    | {
        category: 'error';
        group: 'cppxrefs';
        name: 'cppxrefs_generate_compdb_error';
        error: string;
      }
    | {
        category: 'background';
        group: 'cppxrefs';
        name: 'cppxrefs_no_chroot';
      }
  );

interface DebuggingEvent extends EventBase {
  category: 'interactive';
  group: 'debugging';
  name: 'debugging_run_gtest' | 'debugging_debug_gtest';
  package_names: string;
  tests_count: number;
}

interface TastEvent extends EventBase {
  category: 'interactive';
  group: 'tast';
  name: 'tast_setup_dev_environment';
}

type SpellcheckerEvent = EventBase &
  (
    | {
        category: 'error';
        group: 'spellchecker';
        name: 'spellchecker_error';
      }
    | {
        category: 'background';
        group: 'spellchecker';
        name: 'spellchecker_diagnostics';
        diagnostics_count: number;
      }
  );

type IdeStatusEvent = EventBase & {
  category: 'interactive';
  group: 'idestatus';
} & (
    | {
        name:
          | 'idestatus_show_ide_status'
          | 'idestatus_show_linter_log'
          | 'cppxrefs_show_cpp_log'
          | 'platform_ec_show_log'
          | 'show_ui_actions_log';
      }
    | {
        name: 'idestatus_show_task_log';
        task_status: string;
      }
  );

interface CipdEvent extends EventBase {
  category: 'error';
  group: 'cipd';
  name: 'cipd_init_failed' | 'cipd_install_failed';
}

type ChromiumIdeExtensionEvent = EventBase & {
  group: 'misc';
} & (
    | {
        category: 'error';
        name: 'extension_activation_failed';
      }
    | {
        category: 'background';
        name: 'extension_activated';
      }
    | {
        category: 'background';
        name: 'get_user_id_age';
        age: number;
      }
  );

interface OwnersEvent extends EventBase {
  category: 'interactive';
  group: 'owners';
  name: 'owners_clicked_file_or_link';
}

// Add new Event interfaces to UAEventDeprecated (joint by or |).
export type Event =
  | DeviceManagementEvent
  | CodesearchErrorEvent
  | CodesearchInteractiveEvent
  | ActivateChromiumosEvent
  | CodesearchSearchSelectionEvent
  | GerritEvent
  | VirtualdocumentOpenDocumentEvent
  | LintErrorEvent
  | LintSkipEvent
  | LintUpdateEvent
  | chromiumOutputDirectoriesBackgroundEvent
  | chromiumOutputDirectoriesErrorEvent
  | chromiumOutputDirectoriesInteractiveEvent
  | ExtensionSuggestedEvent
  | ExtensionInstalledEvent
  | CoverageEvent
  | CrosFormatEvent
  | PackageCrosWorkonEvent
  | PackageOpenEbuildEvent
  | TargetBoardEvent
  | CppCodeCompletionEvent
  | DebuggingEvent
  | TastEvent
  | SpellcheckerEvent
  | IdeStatusEvent
  | CipdEvent
  | MiscEvent
  | ChromiumIdeExtensionEvent
  | OwnersEvent;

/**
 * Manipulate given string to make sure it satisfies constraints imposed by GA4.
 * https://developers.google.com/analytics/devguides/collection/protocol/ga4/sending-events?client_type=gtag#limitations
 *
 *
 * TODO(b/281925148): Temporary measure only, implement static type check for it instead.
 */
export function sanitizeEventName(name: string): string {
  return name
    .replace(/\s/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '')
    .slice(0, 40);
}
