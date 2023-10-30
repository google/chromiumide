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
  timestamp?: string;
  severity?: SyslogSeverity;
  process?: string;
  message: string;
};

/** Severity of a syslog entry. */
export type SyslogSeverity =
  | 'DEBUG'
  | 'INFO'
  | 'NOTICE'
  | 'WARNING'
  | 'ERR'
  | 'ERROR'
  | 'ALERT'
  | 'EMERG'
  | 'CRIT';

/** Message from the backend. */
export type SyslogViewBackendMessage = {
  /** Request that the frontend should add new system log entries. */
  command: 'add';
  /** New system log entries. */
  newEntries: SyslogEntry[];
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

/** The regex used for `parseSyslogLine`. */
const SYSLOG_REGEX = /^([^ ]*) ([^ ]*) ([^ ]*): (.*)$/;

/**
 * Parses a syslog line to get an entry.
 *
 * Returns a fallback without timestamp, severity and process
 * when the line is not of the expected format.
 */
export function parseSyslogLine(line: string, lineNum: number): SyslogEntry {
  const fallback = {lineNum, message: line};
  const regexRes = SYSLOG_REGEX.exec(line);
  if (regexRes === null) return fallback;
  const [, timestamp, severity, process, message] = regexRes;
  if (isNaN(Date.parse(timestamp))) return fallback;
  switch (severity) {
    case 'DEBUG':
    case 'INFO':
    case 'NOTICE':
    case 'WARNING':
    case 'ERROR':
    case 'ERR':
    case 'ALERT':
    case 'EMERG':
    case 'CRIT':
      break;
    default:
      return fallback;
  }
  return {
    lineNum,
    timestamp,
    severity,
    process,
    message,
  };
}

/** Converts syslog entries to a string in the standard format. */
export function stringifySyslogEntries(entries: SyslogEntry[]): string {
  return entries.map(stringifySyslogEntry).join('\n') + '\n';
}

/** Converts a syslog entry to a string in the standard format. */
function stringifySyslogEntry(entry: SyslogEntry): string {
  if (entry.timestamp) {
    return `${entry.timestamp} ${entry.process}: ${entry.message}`;
  } else {
    return `${entry.message}`; // Fallback
  }
}
