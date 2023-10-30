// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {MemoryOutputChannel} from '../../../common/memory_output_channel';

describe('Memory output channel', () => {
  it('outputs all the appended values concatenated', () => {
    const channel = new MemoryOutputChannel();

    expect(channel.output).toEqual('');

    channel.append('a');
    channel.append('bc');

    expect(channel.output).toEqual('abc');
    expect(channel.output).toEqual('abc');
  });
});
