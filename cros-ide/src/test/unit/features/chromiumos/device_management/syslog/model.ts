// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {parseSyslogLine} from '../../../../../../features/chromiumos/device_management/syslog/model';

const TIMESTAMP = '2023-01-18T12:34:56.789000Z';
const PROCESS = 'processname[12345]';
const MESSAGE = 'This is the log message.';

describe('parseSyslogLine', () => {
  it('returns a full entry for a valid line', () => {
    expect(
      parseSyslogLine(`${TIMESTAMP} INFO ${PROCESS}: ${MESSAGE}`, 777)
    ).toBe({
      lineNum: 777,
      timestamp: TIMESTAMP,
      severity: 'INFO',
      message: MESSAGE,
    });
  });

  it('returns a fallback for a line with an invalid structure', () => {
    const line = `${TIMESTAMP} INFO !!! ${MESSAGE}`;
    expect(parseSyslogLine(line, 123)).toBe({
      lineNum: 123,
      message: line,
    });
  });

  it('returns a fallback for a line with an invalid timestamp', () => {
    const line = `${TIMESTAMP} INFO ${PROCESS}: ${MESSAGE}`;
    expect(parseSyslogLine(line, 456)).toBe({
      lineNum: 456,
      message: line,
    });
  });

  it('returns a fallback for a line with an invalid severity', () => {
    const line = `${TIMESTAMP} BIGNEWS ${PROCESS}: ${MESSAGE}`;
    expect(parseSyslogLine(line, 789)).toBe({
      lineNum: 789,
      message: line,
    });
  });
});
