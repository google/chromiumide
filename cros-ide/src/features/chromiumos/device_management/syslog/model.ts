// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/** Context of a syslog view. */
export type SyslogViewContext = {
  hostname: string;
  remoteSyslogPath: string;
};

/** Content of a syslog entry. */
export type SyslogEntry = {
  lineNum: number;
  timestamp: string;
  severity: SyslogSeverity;
  process: string;
  message: string;
};

/** Severity of a syslog entry. */
export type SyslogSeverity =
  | 'DEBUG'
  | 'INFO'
  | 'NOTICE'
  | 'WARNING'
  | 'ERR'
  | 'ALERT'
  | 'EMERG'
  | 'CRIT';

/** Message from the backend. */
export type SyslogViewBackendMessage = {
  /** Request that the frontend should reset the log entries. */
  command: 'reset';
  /** System log entries. */
  entries: SyslogEntry[];
};

/** Message from the frontend. */
export type SyslogViewFrontendMessage = {
  /** Request that the backend should reload the log file. */
  command: 'reload';
};
