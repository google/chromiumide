// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {parseSyslogLine} from '../../../../../../features/device_management/syslog/model';

const TIMESTAMP = '2023-01-18T12:34:56.789000Z';
const PROCESS = 'processname[12345]';
const MESSAGE = 'This is the log message.';

describe('parseSyslogLine', () => {
  (
    [
      'DEBUG',
      'INFO',
      'NOTICE',
      'WARNING',
      'ERROR',
      'ERR',
      'ALERT',
      'EMERG',
      'CRIT',
    ] as const
  ).forEach(severity => {
    it(`returns a full entry for a valid line with severity ${severity}`, () => {
      expect(
        parseSyslogLine(`${TIMESTAMP} ${severity} ${PROCESS}: ${MESSAGE}`, 777)
      ).toEqual({
        lineNum: 777,
        timestamp: TIMESTAMP,
        severity,
        process: PROCESS,
        message: MESSAGE,
      });
    });
  });

  it('returns a fallback for a line with an invalid structure', () => {
    const line = `${TIMESTAMP} INFO !!! ${MESSAGE}`;
    expect(parseSyslogLine(line, 123)).toEqual({
      lineNum: 123,
      message: line,
    });
  });

  it('returns a fallback for a line with an invalid timestamp', () => {
    const line = `abc123 INFO ${PROCESS}: ${MESSAGE}`;
    expect(parseSyslogLine(line, 456)).toEqual({
      lineNum: 456,
      message: line,
    });
  });

  it('returns a fallback for a line with an invalid severity', () => {
    const line = `${TIMESTAMP} BIGNEWS ${PROCESS}: ${MESSAGE}`;
    expect(parseSyslogLine(line, 789)).toEqual({
      lineNum: 789,
      message: line,
    });
  });
});
