// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {LineBufferedOutputAdapter} from '../../../../common/line_buffered_output_adapter';
import {MemoryOutputChannel} from '../../../../common/memory_output_channel';
import {TEST_ONLY, runAutoninja} from '../../../../features/chromium/autoninja';
import * as config from '../../../../services/config';
import * as testing from '../../../testing';

describe('autoninja output adapter', () => {
  beforeEach(() => {
    jasmine.clock().install();
    jasmine.clock().mockDate();
  });
  afterEach(() => {
    jasmine.clock().uninstall();
  });

  it("passes through lines that don't indicate compile progress", () => {
    const memoryChannel = new MemoryOutputChannel();
    const adapter = TEST_ONLY.AutoninjaOutputAdapter.create(memoryChannel);

    adapter.append('test abc');
    expect(memoryChannel.output).toBe('');

    adapter.append(' 123\n');
    expect(memoryChannel.output).toBe('test abc 123\n');

    adapter.append('another line\n');
    expect(memoryChannel.output).toBe('test abc 123\nanother line\n');

    adapter.append('[not a number/foo bar]\n');
    expect(memoryChannel.output).toBe(
      'test abc 123\nanother line\n[not a number/foo bar]\n'
    );
  });

  it('passes through compile progress lines when less than 200 steps remain', () => {
    const memoryChannel = new MemoryOutputChannel();
    const adapter = TEST_ONLY.AutoninjaOutputAdapter.create(memoryChannel);

    adapter.append('[10/20] a\n');
    expect(memoryChannel.output).toBe('[10/20] a\n');

    adapter.append('[0/0] b\n');
    expect(memoryChannel.output).toBe('[10/20] a\n[0/0] b\n');

    adapter.append('[900/1000] c\n');
    expect(memoryChannel.output).toBe('[10/20] a\n[0/0] b\n[900/1000] c\n');
  });

  it('buffers compile progress lines when more than 200 steps remain', () => {
    const memoryChannel = new MemoryOutputChannel();
    const adapter = TEST_ONLY.AutoninjaOutputAdapter.create(memoryChannel);
    const CLEAR = '\u001b[K';

    const expectEq = (a: string, b: string) => {
      // The use of control characters makes it so that naive printing of `a` and `b` messes up the
      // terminal and makes it hard to debug failed expectations. By converting to JSON, we avoid
      // the messy terminal output and allow easy comparison of expected and actual values in case
      // an expectation fails.
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    };

    adapter.append('Start compilation\n');
    expect(memoryChannel.output).toBe('Start compilation\n');

    adapter.append('[100/1000] a\n');
    expectEq(
      memoryChannel.output,
      `Start compilation\n${CLEAR}Compile progress: 10.00% (100/1000)\r`
    );

    // Progress is printed every 500ms, so this should not print additional progress.
    adapter.append('[200/1000] b\n');
    expectEq(
      memoryChannel.output,
      `Start compilation\n${CLEAR}Compile progress: 10.00% (100/1000)\r`
    );

    jasmine.clock().tick(500);
    // Progress should still not be updated, since no new output lines have been received (this is
    // actually not ideal - ideally, we'd print the latest progress every 500ms, and not wait for
    // the next output line. However, this would make the code a bit more complicated for little
    // gain).
    expectEq(
      memoryChannel.output,
      `Start compilation\n${CLEAR}Compile progress: 10.00% (100/1000)\r`
    );

    adapter.append('[300/1000] c\n');
    expectEq(
      memoryChannel.output,
      `Start compilation\n${CLEAR}Compile progress: 10.00% (100/1000)\r${CLEAR}Compile progress: 30.00% (300/1000)\r`
    );

    adapter.append('[800/1000] e\n');
    adapter.append('[801/1000] f\n');
    adapter.append('[1000/1000] g\n');
    expectEq(
      memoryChannel.output,
      `\
Start compilation
${CLEAR}Compile progress: 10.00% (100/1000)\r\
${CLEAR}Compile progress: 30.00% (300/1000)\r\
[800/1000] e
[801/1000] f
[1000/1000] g
`
    );
  });
});

describe('autoninja wrapper', () => {
  const {vscodeEmitters, vscodeSpy} = testing.installVscodeDouble();
  testing.installFakeConfigs(vscodeSpy, vscodeEmitters);
  const {fakeExec} = testing.installFakeExec();

  beforeEach(async () => {
    await config.paths.depotTools.update('/opt/custom_depot_tools');
  });

  it('calls autoninja', async () => {
    fakeExec.installCallback(
      'autoninja',
      ['a', 'b'],
      () => 'stdout is unused',
      jasmine.objectContaining({
        cwd: 'cwd',
        env: jasmine.objectContaining({
          PATH: jasmine.stringContaining('/opt/custom_depot_tools'),
          NINJA_STATUS: '[%f/%t] ',
          CLICOLOR_FORCE: '1',
        }),
        logger: {
          /*
           * The asymmetricMatch function is required, and must return a boolean.
           */
          asymmetricMatch: (logger: unknown) =>
            logger instanceof LineBufferedOutputAdapter,
        },
      })
    );

    const logger = new MemoryOutputChannel();
    const tokenSource = new vscode.CancellationTokenSource();
    const result = await runAutoninja(
      ['a', 'b'],
      'cwd',
      logger,
      tokenSource.token
    );
    expect(result).not.toBeInstanceOf(Error);
  });
});
