// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {DeviceSyslogEntry} from '../../../common/syslog';

/** Context of a syslog view. */
export type SyslogViewContext = {
  hostname: string;
  remoteSyslogPath: string;
};

/** Message from the backend. */
export type SyslogViewBackendMessage = {
  /** Request that the frontend should add new system log entries. */
  command: 'add';
  /** New system log entries. */
  newEntries: DeviceSyslogEntry[];
};

/** Message from the frontend. */
export type SyslogViewFrontendMessage =
  | {
      /** Request that the backend should load new system log entries. */
      command: 'reload';
    }
  | {
      /** Request that the backend should copy the text to the clipboard. */
      command: 'copy';
      text: string;
    };

/** Converts syslog entries to a string in the standard format. */
export function stringifySyslogEntries(entries: DeviceSyslogEntry[]): string {
  return entries.map(stringifySyslogEntry).join('\n') + '\n';
}

/** Converts a syslog entry to a string in the standard format. */
function stringifySyslogEntry(entry: DeviceSyslogEntry): string {
  if (entry.timestamp) {
    return `${entry.timestamp} ${entry.process}: ${entry.message}`;
  } else {
    return `${entry.message}`; // Fallback
  }
}
