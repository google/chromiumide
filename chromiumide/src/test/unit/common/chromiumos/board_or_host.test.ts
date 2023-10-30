// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {BoardOrHost} from '../../../../common/chromiumos/board_or_host';

describe('BoardOrHost', () => {
  const host = BoardOrHost.parse('host');
  const betty = BoardOrHost.parse('betty');

  it('can parse and produce string', () => {
    expect(host).toEqual(BoardOrHost.HOST);
    expect(betty).toEqual(BoardOrHost.newBoard('betty'));

    expect(host.toString()).toEqual(BoardOrHost.HOST_AS_STRING);
    expect(betty.toString()).toEqual('betty');
  });

  it('toBoardName returns SDK board name for host', () => {
    expect(BoardOrHost.HOST.toBoardName()).toEqual('amd64-host');
    expect(BoardOrHost.newBoard('betty').toBoardName()).toEqual('betty');
  });

  it('throws if board name is host', () => {
    try {
      BoardOrHost.newBoard(BoardOrHost.HOST_AS_STRING);
      fail('got no error; want error');
    } catch {
      // OK
    }
  });

  it('has accessors', () => {
    expect(host.isHost).toBeTrue();
    expect(betty.isHost).toBeFalse();
  });

  it('has map method', () => {
    const double = (s: string) => s.repeat(2);

    expect(host.map(double, 'v')).toEqual('v');
    expect(betty.map(double, 'v')).toEqual('bettybetty');
  });
});
