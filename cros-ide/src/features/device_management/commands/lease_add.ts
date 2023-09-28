// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {Metrics} from '../../metrics/metrics';
import * as crosfleet from '../crosfleet';
import * as sshConfig from '../ssh_config';
import {CommandContext} from './common';

interface Filter extends vscode.QuickPickItem {
  key: keyof crosfleet.LeaseOptions;
  label: string;
  detail: string;
}

const FILTERS: Filter[] = [
  {
    key: 'board',
    label: 'Board Name',
    detail: 'Filter by board name (e.g. "eve", "coral", "octopus")',
  },
  {
    key: 'model',
    label: 'Model Name',
    detail: 'Filter by model name (e.g. "eve", "nasher", "apel")',
  },
  {
    key: 'hostname',
    label: 'Host Name',
    detail: 'Filter by exact host name (e.g. "chromeos1-row2-rack3-host4")',
  },
];

export async function addLease(context: CommandContext): Promise<void> {
  Metrics.send({
    category: 'interactive',
    group: 'device',
    name: 'device_management_add_lease',
    description: 'add lease',
  });

  const filter = await vscode.window.showQuickPick(FILTERS, {
    title: 'Lease a Device: Filter by...',
    placeHolder:
      'Select the filtering method (e.g. "Board Name") and press Enter',
  });
  if (!filter) {
    return;
  }

  const filterValue = await vscode.window.showInputBox({
    title: `Lease a Device: Filter by ${filter.label}`,
    prompt: `Enter a ${filter.label.toLowerCase()} to filter devices`,
  });
  if (!filterValue) {
    return;
  }

  const durationStr = await vscode.window.showInputBox({
    title: 'Lease a Device: Lease Duration',
    value: '60',
    prompt: 'Enter the duration (in minutes) to lease a device for',
    validateInput(value) {
      const parsed = Number(value);
      if (isNaN(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
        return 'Enter a positive integer';
      }
      return undefined;
    },
  });
  if (!durationStr) {
    return;
  }

  // Show the output window to make the progress visible.
  context.output.show();

  try {
    // Show a progress notification as this is a long operation.
    const cancelled = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        cancellable: true,
        title: 'Requesting to lease a device...',
      },
      async (_progress, token) => {
        try {
          await context.crosfleetRunner.requestLease({
            token: token,
            durationInMinutes: Number(durationStr),
            [filter.key]: filterValue,
          });
        } catch (err) {
          if (token.isCancellationRequested) {
            return true;
          }
          throw err;
        }
        return false;
      }
    );
    if (cancelled) {
      void vscode.window.showWarningMessage(
        'Cancelled leasing a device, but you might still get a device if a swarming job has already been scheduled.'
      );
      return;
    }
  } catch (e: unknown) {
    void vscode.window.showErrorMessage(`Failed to lease a device: ${e}`);
  }

  // Show an informational message if the user has not set up lab access.
  if (!(await sshConfig.isLabAccessConfigured())) {
    const choice = await vscode.window.showInformationMessage(
      'You need to set up SSH configs to access leased devices.',
      'Open Documentation'
    );
    if (choice) {
      void vscode.env.openExternal(
        vscode.Uri.parse('http://goto.google.com/chromeos-lab-duts-ssh')
      );
    }
  }
}
