// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/** Content of a syslog entry on DUT. */
export type DeviceSyslogEntry = {
  lineNum: number;
  timestamp?: string;
  severity?: DeviceSyslogSeverity;
  process?: string;
  message: string;
};

/** Severity of a syslog entry. */
export type DeviceSyslogSeverity =
  | 'DEBUG'
  | 'INFO'
  | 'NOTICE'
  | 'WARNING'
  | 'ERR'
  | 'ERROR'
  | 'ALERT'
  | 'EMERG'
  | 'CRIT';

/** Content of a syslog entry on local machine. */
export type LocalSyslogEntry = {
  // timestamp like '2024-06-05T22:20:11.761573+00:00'
  timestamp: string;
  hostname: string;
  // process name like 'gcert[856021]'
  process: string;
  message: string;
};

/**
 * The regex used for parsing syslog. The second entry is hostname on local machine, and severity
 * on DUT.
 *
 * Example line on local machine:
 * 2024-06-07T03:00:40.905743+00:00 example.com glinux-scheduler[3782168]: msg
 *
 * Example line on chromeos device:
 * 2024-06-06T04:34:16.875867Z INFO kernel: msg
 */
const SYSLOG_REGEX = /^([^ ]*) ([^ ]*) ([^ ]*): (.*)$/;

/**
 * Parses a DUT's syslog line to get an entry.
 *
 * Returns a fallback without timestamp, severity and process
 * when the line is not of the expected format.
 */
export function parseDeviceSyslogLine(
  line: string,
  lineNum: number
): DeviceSyslogEntry {
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

/** Parses a local syslog line to get an entry. */
export function parseLocalSyslogLine(
  line: string
): LocalSyslogEntry | undefined {
  const m = SYSLOG_REGEX.exec(line.trim());
  if (!m) return;
  const [, timestamp, hostname, process, message] = m;
  return {
    timestamp,
    hostname,
    process,
    message,
  };
}
