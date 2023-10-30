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
  | 'boards_and_packages'
  | 'chromium.gtest'
  | 'chromium.outputDirectories'
  | 'codesearch'
  | 'coverage'
  | 'cipd'
  | 'cppxrefs'
  | 'debugging'
  | 'device'
  | 'ebuild'
  | 'format'
  | 'gerrit'
  | 'git_watcher'
  | 'hints'
  | 'idestatus'
  | 'lint'
  | 'misc'
  | 'owners'
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

interface ActivateChromiumosEvent extends EventBase {
  category: 'error';
  group: 'misc';
  name: 'activate_chromiumos_error';
}

type ChromiumIdeExtensionEvent = EventBase & {
  group: 'misc';
} & (
    | {
        category: 'background';
        name: 'extension_activated';
      }
    | {
        category: 'background';
        name: 'get_user_id_age';
        age: number;
      }
    | {
        category: 'error';
        name: 'extension_activation_failed';
      }
  );

interface ChromiumGtestEvent extends EventBase {
  group: 'chromium.gtest';
  category: 'error';
  name:
    | 'chromium_gtest_no_test_cases_found'
    | 'chromium_gtest_calculate_test_targets_failed'
    | 'chromium_gtest_build_test_targets_failed'
    | 'chromium_gtest_extract_tests_from_target'
    | 'chromium_gtest_test_target_has_no_matching_test_cases'
    | 'chromium_gtest_test_run_failed'
    | 'chromium_gtest_parse_test_results_failed'
    | 'chromium_gtest_test_item_for_test_result_failed';
}

type ChromiumOutputDirectoriesEvent = EventBase & {
  group: 'chromium.outputDirectories';
} & (
    | {
        category: 'background';
        name: 'chromium_outputDirectories_built_node_cache';
        output_directories_count: number;
      }
    | {
        category: 'error';
        name:
          | 'chromium_outputDirectories_invalid_directory_name'
          | 'chromium_outputDirectories_not_a_symlink'
          | 'chromium_outputDirectories_race_condition_at_rebuild'
          | 'chromium_outputDirectories_symlink_not_linked';
      }
    | {
        category: 'interactive';
        name:
          | 'chromium_outputDirectories_change_output_directory'
          | 'chromium_outputDirectories_edit_args_gn'
          | 'chromium_outputDirectories_view_args_gn_error'
          | 'chromium_outputDirectories_view_args_gn_warnings'
          | 'chromium_outputDirectories_refresh';
      }
  );

interface CipdEvent extends EventBase {
  category: 'error';
  group: 'cipd';
  name: 'cipd_init_failed' | 'cipd_install_failed';
}

type CodesearchEvent = EventBase & {
  group: 'codesearch';
} & (
    | {
        category: 'error';
        name: 'codesearch_generate_cs_path_failed';
      }
    | {
        category: 'interactive';
        name:
          | 'codesearch_copy_current_file'
          | 'codesearch_open_current_file'
          | 'codesearch_open_files';
      }
    | {
        category: 'interactive';
        name: 'codesearch_search_selection';
        selected_text: string;
      }
  );

type CoverageEvent = EventBase &
  (
    | {
        category: 'background';
        group: 'coverage';
        name: 'coverage_show_background';
      }
    | {
        category: 'interactive';
        group: 'coverage';
        name: 'coverage_generate' | 'coverage_show';
        board: string;
        package: string;
      }
  );

type CppCodeCompletionEvent = EventBase & {
  group: 'cppxrefs';
} & (
    | {
        category: 'background';
        name: 'cppxrefs_generate_compdb';
        action: string;
      }
    | {
        category: 'background';
        name: 'cppxrefs_interact_with_platform2_cpp' | 'cppxrefs_no_chroot';
      }
    | {
        category: 'error';
        group: 'cppxrefs';
        name: 'cppxrefs_generate_compdb_error';
        error: string;
      }
  );

type CrosFormatEvent = EventBase & {group: 'format'} & (
    | {
        category: 'background';
        name: 'cros_format';
      }
    | {
        category: 'error';
        name: 'cros_format_call_error' | 'cros_format_return_error';
      }
  );

interface DebuggingEvent extends EventBase {
  category: 'interactive';
  group: 'debugging';
  name: 'debugging_debug_gtest' | 'debugging_run_gtest';
  package_names: string;
  tests_count: number;
}

type DeviceManagementEvent = EventBase & {
  category: 'interactive';
  group: 'device';
} & (
    | {
        name:
          | 'device_management_abandon_lease'
          | 'device_management_add_device'
          | 'device_management_add_existing_hosts'
          | 'device_management_add_lease'
          | 'device_management_connect_to_device_ssh'
          | 'device_management_connect_to_device_vnc'
          | 'device_management_copy_hostname'
          | 'device_management_debug_tast_tests'
          | 'device_management_delete_device'
          | 'device_management_log_in_to_crosfleet'
          | 'device_management_refresh_leases'
          | 'device_management_run_tast_tests'
          | 'device_management_syslog_viewer_copy'
          | 'device_management_syslog_viewer_open';
      }
    | {
        name: 'device_management_flash_prebuilt_image';
        image_type: string;
      }
  );

type ExtensionSuggestionEvent = EventBase & {
  group: 'misc';
} & (
    | {
        category: 'background';
        name: 'misc_suggested_extension';
        extension: string;
      }
    | {
        category: 'interactive';
        name: 'misc_installed_suggested_extension';
        extension: string;
      }
  );

type EbuildEvent = EventBase & {
  group: 'ebuild';
} & {
  category: 'background';
  name:
    | 'show_portage_predefined_read_only_variable_hover'
    | 'show_ebuild_defined_variable_hover'
    | 'show_ebuild_phase_function_hover';
  word: string;
};

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

type GitWatcherEvent = EventBase & {
  group: 'git_watcher';
  category: 'error';
  name: 'git_watcher_no_commit';
};

type HintsEvent = EventBase & {
  group: 'hints';
} & (
    | {
        category: 'background';
        name: 'hints_show_chromiumos_workspace_warning';
      }
    | {
        category: 'interactive';
        name: 'hints_ignore_chromiumos_workspace_warning';
      }
  );

type IdeStatusEvent = EventBase & {
  category: 'interactive';
  group: 'idestatus';
} & (
    | {
        name:
          | 'cppxrefs_show_cpp_log'
          | 'idestatus_show_ide_status'
          | 'idestatus_show_linter_log'
          | 'platform_ec_show_log'
          | 'show_ui_actions_log';
      }
    | {
        name: 'idestatus_show_task_log';
        task_status: string;
      }
  );

type LintEvent = EventBase & {
  group: 'lint';
} & (
    | {
        category: 'background';
        name: 'lint_skip';
        language_id: string;
      }
    | {
        category: 'background';
        name: 'lint_update';
        language_id: string;
        length: number;
      }
    | {
        category: 'error';
        name: 'lint_update_diagnostic_error' | 'lint_missing_diagnostics';
      }
  );

type MiscEvent = EventBase & {
  group: 'misc';
} & (
    | {
        category: 'background';
        name: 'product_watcher_multiple_products';
      }
    | {
        category: 'error';
        name: 'misc_error_active_chromium_feature';
        feature: string;
      }
    | {
        category: 'interactive';
        group: 'misc';
        name: 'show_help';
      }
  );

interface OwnersEvent extends EventBase {
  category: 'interactive';
  group: 'owners';
  name: 'owners_clicked_file_or_link';
}

type BoardsAndPackagesEvent = EventBase & {
  group: 'boards_and_packages';
} & (
    | {
        category: 'interactive';
        name: 'boards_and_packages_open_ebuild';
      }
    | {
        category: 'interactive';
        name:
          | 'boards_and_packages_cros_workon_start'
          | 'boards_and_packages_cros_workon_stop';
        package: string;
        board: string;
      }
  );

type SpellcheckerEvent = EventBase &
  (
    | {
        category: 'background';
        group: 'spellchecker';
        name: 'spellchecker_diagnostics';
        diagnostics_count: number;
      }
    | {
        category: 'error';
        group: 'spellchecker';
        name: 'spellchecker_error';
      }
  );

interface TargetBoardEvent extends EventBase {
  category: 'interactive';
  group: 'misc';
  name: 'select_target_board';
  board: string;
}

type TastEvent = EventBase & {
  group: 'tast';
} & (
    | {
        category: 'interactive';
        name: 'tast_setup_dev_environment';
      }
    | {
        category: 'error';
        name: 'tast_debug_fail_to_get_delve_version_from_ebuild';
      }
  );

interface VirtualdocumentOpenDocumentEvent extends EventBase {
  category: 'interactive';
  group: 'virtualdocument';
  name: 'virtualdocument_open_document';
  document: string;
}

// Add new Event interfaces to UAEventDeprecated (joint by or |).
export type Event =
  | ActivateChromiumosEvent
  | BoardsAndPackagesEvent
  | ChromiumGtestEvent
  | ChromiumIdeExtensionEvent
  | ChromiumOutputDirectoriesEvent
  | CipdEvent
  | CodesearchEvent
  | CoverageEvent
  | CppCodeCompletionEvent
  | CrosFormatEvent
  | DebuggingEvent
  | DeviceManagementEvent
  | ExtensionSuggestionEvent
  | EbuildEvent
  | GerritEvent
  | GitWatcherEvent
  | HintsEvent
  | IdeStatusEvent
  | LintEvent
  | MiscEvent
  | OwnersEvent
  | SpellcheckerEvent
  | TargetBoardEvent
  | TastEvent
  | VirtualdocumentOpenDocumentEvent;

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
