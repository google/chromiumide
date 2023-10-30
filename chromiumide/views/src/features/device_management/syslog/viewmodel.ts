// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {
  SyslogEntry,
  SyslogSeverity,
} from '../../../../../src/features/device_management/syslog/model';
/**
 * Filter on a syslog entry,
 * meaning the conjunction of component conditions.
 */
export type SyslogFilter = {
  onProcess: TextFilter;
  onMessage: TextFilter;
};

/** Syslog entry matching SyslogFilter. */
export type MatchedSyslogEntry = {
  lineNum: number;
  timestamp?: string;
  severity?: SyslogSeverity;
  process?: MatchedText;
  message: MatchedText;
};

/**
 * Converts MatchedSyslogEntry to underlying SyslogEntry.
 */
export function toSyslogEntry(entry: MatchedSyslogEntry): SyslogEntry {
  const {lineNum, timestamp, severity, process, message} = entry;
  return {
    lineNum,
    timestamp,
    severity,
    process: process?.text,
    message: message.text,
  };
}

/** Filter on a text, possibly using a regex. */
export type TextFilter = {
  /** The thing expected to be included in the message. */
  includes: string;
  /** Whether the string `includes` is a regex or a plain string. */
  byRegex: boolean;
  /**
   * The cached regex object.
   * Is set only if `byRegex` is true and `includes` is a valid regular expression.
   */
  regex?: RegExp;
};

/** Text matching TextFilter. */
export type MatchedText = {
  // Original text.
  text: string;
  // Matched part [start, end).
  range: [number, number];
};

/** Initial text filter. */
export function initialTextFilter(): TextFilter {
  return {includes: '', byRegex: false, regex: undefined};
}

/**
 * Computes matching with syslog entry. Returns undefined if entry doesn't match
 * the filter.
 *
 * TODO(oka): Test this function (b:268173226).
 */
export function matchSyslogEntry(
  entry: SyslogEntry,
  filter: SyslogFilter
): MatchedSyslogEntry | undefined {
  const {process, message} = entry;
  const {onProcess, onMessage} = filter;

  const matchedProcess = matchText(process ?? '', onProcess);
  const matchedMessage = matchText(message, onMessage);

  if (matchedProcess === undefined || matchedMessage === undefined) {
    return undefined;
  }

  return {
    ...entry,
    process: matchedProcess,
    message: matchedMessage,
  };
}

function matchText(text: string, filter: TextFilter): MatchedText | undefined {
  const {includes, byRegex, regex} = filter;

  if (!byRegex) {
    const start = text.indexOf(includes);
    if (start === -1) {
      return undefined;
    }
    return {
      text,
      range: [start, start + includes.length],
    };
  }

  if (regex === undefined) {
    return undefined;
  }

  const m = regex.exec(text);
  if (!m) {
    return undefined;
  }

  return {
    text,
    range: [m.index, m.index + m[0].length],
  };
}
