// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import path from 'path';
import * as vscode from 'vscode';
import {Gcert} from '../../../features/gcert';
import * as testing from '../../testing';

const FAKE_SYSLOG_UNDER_TEMP = 'sys.log';

describe('Gcert', () => {
  const tempDir = testing.tempDir();
  const fakeExec = testing.installFakeExec();

  const {vscodeSpy, vscodeEmitters} = testing.installVscodeDouble();

  const state = testing.cleanState(async () => {
    const gcert = new Gcert(
      new testing.fakes.ConsoleOutputChannel(),
      tempDir.path,
      path.join(tempDir.path, FAKE_SYSLOG_UNDER_TEMP)
    );
    await testing.putFiles(tempDir.path, {
      [FAKE_SYSLOG_UNDER_TEMP]: '',
    });

    const runEventReader = new testing.EventReader(gcert.onDidRun);
    return {
      gcert,
      runEventReader,
    };
  });

  afterEach(() => {
    state.runEventReader.dispose();
    state.gcert.dispose();
  });

  for (const testCase of [
    {
      name: 'should run even if gcert is not expired',
      gcertstatus: 0,
      wantCommand: 'exec gcert\n',
    },
    {
      name: 'should run if gcert is expired',
      gcertstatus: 9,
      wantCommand: 'exec gcert\n',
    },
    {
      name: 'should ask ssh auth sock to use if not found',
      gcertstatus: 90,
      tempFiles: ['ssh-X/agent.1', 'ssh-Y/agent.2', 'foo/bar'],
      chosenAuthSock: 'ssh-X/agent.1',
      wantQuickPickArgs: ['ssh-X/agent.1', 'ssh-Y/agent.2'],
      wantCommand: jasmine.stringMatching(
        new RegExp('exec env SSH_AUTH_SOCK=.*/ssh-X/agent.1 gcert\\n')
      ),
    },
  ]) {
    it(testCase.name, async () => {
      if (testCase.tempFiles) {
        for (const x of testCase.tempFiles) {
          await testing.putFiles(tempDir.path, {
            [x]: '',
          });
        }
      }

      if (testCase.chosenAuthSock) {
        vscodeSpy.window.showQuickPick
          .withArgs(
            testCase.wantQuickPickArgs.map(x =>
              jasmine.objectContaining({
                label: path.join(tempDir.path, x),
              })
            ),
            {
              title: jasmine.stringContaining('to run gcert'),
            }
          )
          .and.returnValue({
            label: path.join(tempDir.path, testCase.chosenAuthSock),
          });
      }

      const terminal = new testing.fakes.FakeTerminal({
        onSendText: text => {
          if (text.startsWith('exec ')) {
            terminal.close({
              code: 0,
              reason: vscode.TerminalExitReason.Process,
            });
          }
        },
        vscodeEmitters,
      });

      vscodeSpy.window.createTerminal.and.returnValue(terminal);

      fakeExec.installCallback('gcertstatus', [], async () => {
        return {
          stdout: '',
          stderr: '',
          exitStatus: testCase.gcertstatus,
        };
      });
      await vscode.commands.executeCommand('chromiumide.gcert.run');

      await state.runEventReader.read();

      expect(terminal.getTexts()).toEqual(testCase.wantCommand);

      expect(vscodeSpy.window.showInformationMessage).toHaveBeenCalledOnceWith(
        'gcert succeeded'
      );
    });
  }

  it('should open troubleshooting if use dismisses SSH_AUTH_SOCK prompt', async () => {
    await testing.putFiles(tempDir.path, {
      'ssh-X/agent.1': '',
      'ssh-Y/agent.2': '',
    });
    vscodeSpy.window.showQuickPick.and.returnValue(undefined);

    fakeExec.installCallback('gcertstatus', [], async () => {
      return {
        stdout: '',
        stderr: '',
        exitStatus: 90,
      };
    });

    vscodeSpy.window.showErrorMessage.and.returnValue('Open Guide');

    await vscode.commands.executeCommand('chromiumide.gcert.run');

    await state.runEventReader.read();

    // Error handling is done asynchronously.
    await testing.flushMicrotasksUntil(
      async () => vscodeSpy.env.openExternal.calls.count() > 0,
      100
    );

    expect(vscodeSpy.env.openExternal).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({
        path: '/chromiumide-doc-gcert-ssh-auth-sock',
      })
    );
  });

  it('should analyze syslog and add error message', async () => {
    // Several JSON entries are reducted from the actual message for gcert.
    const syslog = `<fake corrupted line>
2024-06-05T23:30:39.952201+00:00 example.com gcert[930374]: logjam_tag=gcert {"Success":false,"ErrorMessage":"[gnubby] could not create SSO session: [gnubby] 🛑 your credentials were rejected (wrong password?). error message = Authenticate full ticket error: BAD_PASSWORD"}
2024-06-05T23:30:39.952201+00:00 example.com fake[1234]: foobar
`;

    await testing.putFiles(tempDir.path, {
      'ssh-X/agent.1': '',
    });

    fakeExec.installCallback('gcertstatus', [], async () => {
      return {
        stdout: '',
        stderr: '',
        exitStatus: 90,
      };
    });

    const terminal = new testing.fakes.FakeTerminal({
      onSendText: () => {
        fs.writeFileSync(
          path.join(tempDir.path, FAKE_SYSLOG_UNDER_TEMP),
          syslog
        );
        terminal.close({
          code: 1,
          reason: vscode.TerminalExitReason.Process,
        });
      },
      vscodeEmitters,
    });
    vscodeSpy.window.createTerminal.and.returnValue(terminal);

    await vscode.commands.executeCommand('chromiumide.gcert.run');

    await state.runEventReader.read();

    expect(vscodeSpy.window.showErrorMessage).toHaveBeenCalledOnceWith(
      'gcert failed: logjam_tag=gcert {"Success":false,"ErrorMessage":"[gnubby] could not create SSO session: [gnubby] 🛑 your credentials were rejected (wrong password?). error message = Authenticate full ticket error: BAD_PASSWORD"}'
    );
  });
});
