// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as commonUtil from '../../shared/app/common/common_util';

/**
 * Wrapper of the lsof command: https://lsof.readthedocs.io/en/stable/manpage
 *
 * Add methods to set options as needed.
 *
 * Example:
 * `await new Lsof().i('tcp:3000').s('tcp:listen').bigF('pc').run(); // [{'p': 12345, 'c': 'code'}]`
 *
 * The command name (the value for 'c') will be truncated to fit in 16 characters. It's a
 * fundamental limitation in many unix dialects according to the man page.
 */
export class Lsof {
  private firstError: Error | undefined;
  private recordError(e: Error): Lsof {
    if (this.firstError) {
      this.firstError = e;
    }
    return this;
  }

  private readonly args: string[] = [];

  async run(opts?: {
    logger?: vscode.OutputChannel;
    token?: vscode.CancellationToken;
  }): Promise<Record<string, string>[] | Error> {
    if (!this.args.includes('-F')) {
      this.recordError(new Error('-F option must be set'));
    }
    if (this.firstError) return this.firstError;

    const result = await commonUtil.exec('lsof', this.args, {
      ignoreNonZeroExit: true,
      logger: opts?.logger,
      cancellationToken: opts?.token,
    });
    if (result instanceof Error) return result;

    if (result.exitStatus !== 0) {
      return [];
    }

    const res: Record<string, string>[] = [];
    for (const line of result.stdout.trim().split('\n')) {
      if (line === '') continue;

      const [kind, value] = [line[0], line.substring(1)];

      if (res.length === 0 || res[res.length - 1][kind] !== undefined) {
        res.push({[kind]: value});
      } else {
        res[res.length - 1][kind] = value;
      }
    }
    return res;
  }

  /**
   * Sets the -i option.
   *
   * An Internet address is specified in the form (Items in square brackets are optional.):
   * [46][protocol][@hostname|hostaddr][:service|port]
   */
  i(address: string): Lsof {
    this.args.push('-i', address);
    return this;
  }

  /**
   * Sets the -s option.
   *
   * When the optional form is available, the s may be followed by a protocol name (p), either TCP
   * or UDP, a colon (`:') and a comma-separated protocol state name list, the option causes open
   * TCP and UDP files to be excluded if their state name(s) are in the list (s) preceded by a `^';
   * or included if their name(s) are not preceded by a `^'.
   *
   * For example, to list only network files with TCP state LISTEN, use: -iTCP -sTCP:LISTEN
   *
   * State names vary with UNIX dialects, so it's not possible to provide a complete list. Some
   * common TCP state names are: CLOSED, IDLE, BOUND, LISTEN, ESTABLISHED, SYN_SENT, SYN_RCDV,
   * ESTABLISHED, CLOSE_WAIT, FIN_WAIT1, CLOSING, LAST_ACK, FIN_WAIT_2, and TIME_WAIT. Two common
   * UDP state names are Unbound and Idle.
   */
  s(protocolColonState: string): Lsof {
    this.args.push('-s', protocolColonState);
    return this;
  }

  /**
   * Sets the -F option. This option must be set to enable parsing.
   *
   * When the -F option is specified, lsof produces output that is suitable for processing by
   * another program.
   *
   * As an example, ``-F pcfn'' will select the process ID (`p'), command name (`c'), file
   * descriptor (`f') and file name (`n') fields with an NL field terminator character.
   *
   * See the "OUTPUT FOR OTHER PROGRAMS" section in the manpage for more details.
   */
  bigF(f: string): Lsof {
    if (f.includes('0')) {
      return this.recordError(
        new Error(
          '-F 0 is unsupported; field terminator should not be changed from NL (\\n)'
        )
      );
    }
    this.args.push('-F', f);
    return this;
  }
}
