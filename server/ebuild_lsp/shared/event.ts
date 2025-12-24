// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * Type of event that the server can notify to the client via the 'custom/metrics' method.
 */
export type MetricsEvent = {
  group: 'ebuild';
  category: 'background';
  description: string;
  name:
    | 'show_portage_predefined_read_only_variable_hover'
    | 'show_ebuild_defined_variable_hover'
    | 'show_ebuild_phase_function_hover';
  word: string;
};
