// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {MemoryOutputChannel} from '../../../common/memory_output_channel';
import {TeeOutputChannel} from '../../../common/tee_output_channel';

describe('Tee output channel', () => {
  it('tees the appended values', () => {
    const o1 = new MemoryOutputChannel();
    const o2 = new MemoryOutputChannel();

    const channel = new TeeOutputChannel(o1, o2);

    channel.append('a');

    expect(o1.output).toEqual('a');
    expect(o2.output).toEqual('a');
  });
});
