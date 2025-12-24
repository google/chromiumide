// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {LineBufferedOutputAdapter} from '../../../common/line_buffered_output_adapter';

class SimpleLogger {
  readonly logs: string[] = [];

  append(data: string): void {
    this.logs.push(data);
  }
}

describe('Line-buffered output adapter', () => {
  it('buffers lines', () => {
    const channel = new SimpleLogger();
    const adapter = new LineBufferedOutputAdapter(channel);

    adapter.append('a');
    expect(channel.logs).toEqual([]);

    adapter.append('\n');
    expect(channel.logs).toEqual(['a\n']);

    adapter.append('b\nc');
    expect(channel.logs).toEqual(['a\n', 'b\n']);

    adapter.append('\n');
    expect(channel.logs).toEqual(['a\n', 'b\n', 'c\n']);

    adapter.append('d\ne\n');
    expect(channel.logs).toEqual(['a\n', 'b\n', 'c\n', 'd\n', 'e\n']);
  });

  it('can flush remaining output', () => {
    const channel = new SimpleLogger();
    const adapter = new LineBufferedOutputAdapter(channel);

    adapter.flush();
    expect(channel.logs).toEqual([]);

    adapter.append('abc123');
    expect(channel.logs).toEqual([]);

    adapter.flush();
    expect(channel.logs).toEqual(['abc123']);

    adapter.flush();
    expect(channel.logs).toEqual(['abc123']);
  });
});
