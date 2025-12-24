// Copyright 2025 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';
import * as vscode from 'vscode';
import * as dateFns from 'date-fns';
import glob from 'glob';
import * as commonUtil from '../../shared/app/common/common_util';
import {getDriver} from '../../shared/app/common/driver_repository';
import {escapeArray} from '../../shared/app/common/shutil';
import {assertNever} from '../../shared/app/common/typecheck';
import {parseLocalSyslogLine} from './syslog';

const driver = getDriver();

/**
 * Runs gcert. If `force` is true, it runs gcert regardless of the gcert status.
 * Otherwise, it doesn't run gcert if the credentials exist. It doesn't check
 * the SSH credential if `noCheckSsh` is true. If `gcertReason` is given, a prompt
 * to confirm running gcert is shown before running it.
 *
 * @returns Whether the user is now certified or asked to proceed anyway.
 */
export async function ensureOrRunGcert(
  options?: {
    noCheckSsh?: boolean;
    force?: boolean;
    gcertReason?: `to ${string}`;
    logger?: vscode.OutputChannel;
  },
  tempDir = '/tmp',
  syslogPath = '/var/log/messages'
): Promise<boolean> {
  let mustUseSshAuthSock = false;
  const gcertStatus = await runGcertstatus(options);
  if (gcertStatus === GCERTSTATUS_NOT_FOUND) {
    // Returns true because certificates could exist.
    return true;
  }
  switch (gcertStatus) {
    case Gcertstatus.Success:
    case Gcertstatus.ExpireSoon:
      if (!options?.force) {
        return true;
      }
      break;
    case Gcertstatus.Expired:
    case Gcertstatus.Invalid:
      break;
    case Gcertstatus.GenericFailure:
      void vscode.window.showErrorMessage(
        'gcertstatus failed with code 1; cannot recover'
      );
      return false;
    case Gcertstatus.NotFound: {
      mustUseSshAuthSock = true;
      break;
    }
    default:
      assertNever(gcertStatus);
  }

  if (options?.gcertReason) {
    const RUN_GCERT = 'Run gcert';
    const CONTINUE_ANYWAY = 'Continue anyway';
    const choice = await vscode.window.showInformationMessage(
      `Need to refresh gcert ${options.gcertReason}`,
      RUN_GCERT,
      CONTINUE_ANYWAY
    );

    if (choice === CONTINUE_ANYWAY) {
      return true;
    }
    if (choice !== RUN_GCERT) {
      return false;
    }
  }

  const syslog = new File(syslogPath);

  let lastSyslogError = '';
  let lastExitCode;

  // On remote VSCode terminal, gcertstatus can return 9 (expired) even when
  // gcert would fail to create SSO session due to missing SSH_AUTH_SOCK, and
  // this is indistinguishable from the case where the auth sock is not needed.
  // Thus we fallback to useSshAuthSock = true when gcert fails.
  for (const useSshAuthSock of [false, true]) {
    if (!useSshAuthSock && mustUseSshAuthSock) continue;

    let sshAuthSock = undefined;
    if (useSshAuthSock) {
      sshAuthSock = await askSshAuthSock(tempDir);
      if (!sshAuthSock) break;
    }

    const syslogPrevSize = await syslog.size();

    lastExitCode = await runGcert(sshAuthSock);

    if (lastExitCode === 0) {
      void vscode.window.showInformationMessage('gcert succeeded');
      return true;
    }

    const syslogCurSize = await syslog.size();
    const gcertEntries = (await syslog.read(syslogPrevSize, syslogCurSize))
      .toString('utf8')
      .split('\n')
      .map(parseLocalSyslogLine)
      .filter(x => x?.process.startsWith('gcert['));
    if (gcertEntries.length > 0) {
      lastSyslogError = gcertEntries[gcertEntries.length - 1]!.message;
    } else {
      lastSyslogError = '';
    }
  }

  void vscode.window.showErrorMessage(
    'gcert failed' + (lastSyslogError ? ': ' + lastSyslogError : '')
  );

  driver.metrics.send({
    group: 'gcert',
    category: 'error',
    description: 'gcert exit status (-1 if not available)',
    name: 'gcert_nonzero_exit_code',
    gcertstatus: gcertStatus,
    exit_code: lastExitCode ?? -1,
  });

  return false;
}

// http://go/gcertstatus#scripting-with-gcertstatus
enum Gcertstatus {
  Success = 0,
  GenericFailure = 1,
  Invalid = 5,
  Expired = 9,
  NotFound = 90,
  ExpireSoon = 91,
}

const GCERTSTATUS_NOT_FOUND = -1 as const;

async function runGcertstatus(options?: {
  noCheckSsh?: boolean;
  logger?: vscode.OutputChannel;
}): Promise<Gcertstatus | typeof GCERTSTATUS_NOT_FOUND> {
  const args = [];
  if (options?.noCheckSsh) {
    args.push('-check_ssh=false');
  }
  const result = await commonUtil.exec('gcertstatus', args, {
    logger: options?.logger,
    ignoreNonZeroExit: true,
  });
  if (result instanceof Error) {
    // exec will return an error despite ignoreNonZeroExit=true when it cannot
    // find gcertstatus in $PATH.
    return GCERTSTATUS_NOT_FOUND;
  }
  return result.exitStatus as Gcertstatus;
}

class File {
  constructor(private readonly filename: string) {}

  async size(): Promise<number> {
    try {
      const stat = await fs.promises.stat(this.filename);
      return stat.size;
    } catch {
      return 0;
    }
  }

  async read(start: number, end: number): Promise<Buffer> {
    let h;
    try {
      h = await fs.promises.open(this.filename);
    } catch {
      return Buffer.alloc(0);
    }
    const r = h.createReadStream({
      start,
      end,
    });

    const chunks: Buffer[] = [];
    r.on('data', chunk => {
      chunks.push(chunk as Buffer);
    });

    return new Promise(resolve => {
      r.on('end', () => {
        resolve(Buffer.concat(chunks));
      });
    });
  }
}

/**
 * Lets the user select SSH_AUTH_SOCK if there are multiple candidates.
 * If there is only one candidate, it returns the value without asking.
 */
async function askSshAuthSock(tempDir: string): Promise<string | undefined> {
  const cands = await util.promisify(glob)(path.join(tempDir, 'ssh-*/agent.*'));

  if (cands.length === 0) {
    void vscode.window.showErrorMessage('No SSH session found');
    return;
  }
  if (cands.length === 1) {
    return cands[0];
  }

  const items: (vscode.QuickPickItem & {durationMs: number})[] =
    await Promise.all(
      cands.map(async cand => {
        const mtime = await fs.promises
          .stat(cand)
          .then(stat => stat.mtime)
          .catch(() => new Date(0));

        // Show duration rather than the mtime, because client and server timezone
        // might differ.
        const duration = dateFns.intervalToDuration({
          start: mtime,
          end: new Date(),
        });
        const durationStr =
          (duration.days ? `${duration.days} days ` : '') +
            dateFns.formatDuration(duration, {
              format: ['hours', 'minutes'],
              zero: false,
            }) || '0 minutes';
        const description = durationStr + ' ago';

        return {
          label: cand,
          description,
          durationMs: dateFns.milliseconds(duration),
        };
      })
    );
  items.sort((a, b) => a.durationMs - b.durationMs);

  const choice = await vscode.window.showQuickPick(items, {
    title: 'Select SSH_AUTH_SOCK to use to run gcert',
  });

  if (!choice) {
    void (async () => {
      const url = 'http://go/chromiumide-doc-gcert-ssh-auth-sock';
      const choice = await vscode.window.showErrorMessage(
        `gcert: not run because SSU_AUTH_SOCK selector was dismissed; see [our guide](${url}) to learn which to select`,
        'Open Guide'
      );
      if (choice) {
        await vscode.env.openExternal(vscode.Uri.parse(url));
      }
    })();
  }

  return choice?.label;
}

/** @returns exit code of gcert */
async function runGcert(sshAuthSock?: string): Promise<number | undefined> {
  const terminal = vscode.window.createTerminal();
  const waitClose = new Promise<void>(resolve => {
    const subscription = vscode.window.onDidCloseTerminal(closedTerminal => {
      if (closedTerminal === terminal) {
        subscription.dispose();
        resolve();
      }
    });
  });
  terminal.show();

  const command = sshAuthSock ? ['env', `SSH_AUTH_SOCK=${sshAuthSock}`] : [];
  command.push('gcert');

  terminal.sendText('exec ' + escapeArray(command));

  await waitClose;

  return terminal.exitStatus?.code;
}
