// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {
  parseBoardOrHost,
  HOST,
  Board,
  HOST_AS_STRING,
  Host,
} from '../../../../../shared/app/common/chromiumos/board_or_host';

describe('BoardOrHost', () => {
  const host = parseBoardOrHost('host');
  const betty = parseBoardOrHost('betty');

  it('can parse and produce string', () => {
    expect(host).toEqual(HOST);
    expect(betty).toEqual(Board.newBoard('betty'));

    expect(host.toString()).toEqual(HOST_AS_STRING);
    expect(betty.toString()).toEqual('betty');
  });

  it('toBoardName returns SDK board name for host', () => {
    expect(HOST.toBoardName()).toEqual('amd64-host');
    expect(Board.newBoard('betty').toBoardName()).toEqual('betty');
  });

  it('throws if board name is host', () => {
    try {
      Board.newBoard(HOST_AS_STRING);
      fail('got no error; want error');
    } catch {
      // OK
    }
  });

  it('is instanceof correct class', () => {
    expect(host instanceof Host).toBeTrue();
    expect(host instanceof Board).toBeFalse();
    expect(betty instanceof Host).toBeFalse();
    expect(betty instanceof Board).toBeTrue();
  });

  it('has map method', () => {
    const double = (s: string) => s.repeat(2);

    expect(host.map(double, 'v')).toEqual('v');
    expect(betty.map(double, 'v')).toEqual('bettybetty');
  });

  it('returns correct portage executables', () => {
    expect(host.suffixedExecutable('emerge')).toEqual('emerge');
    expect(betty.suffixedExecutable('emerge')).toEqual('emerge-betty');
  });
});
