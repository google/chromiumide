// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as commonUtil from '../../../../common/common_util';
import {Metrics} from '../../../metrics/metrics';
import {ErrorDetails} from '.';

export function throwForNoChroot(fileName: string): never {
  // Send metrics before showing the message, because they don't seem
  // to be sent if the user does not act on the message.
  Metrics.send({
    category: 'background',
    group: 'cppxrefs',
    name: 'cppxrefs_no_chroot',
    description: 'cpp xrefs generation without chroot',
  });

  // platform2 user may prefer subdirectories
  const gitFolder = commonUtil.findGitDir(fileName);

  const openOtherFolder = gitFolder ? 'Open Other' : 'Open Folder';

  const buttons = [];
  if (gitFolder) {
    buttons.push({
      label: `Open ${gitFolder}`,
      action: () => {
        void vscode.commands.executeCommand('vscode.openFolder');
      },
    });
  }
  buttons.push({
    label: openOtherFolder,
    action: () => {
      void vscode.commands.executeCommand('vscode.openFolder');
    },
  });

  throw new ErrorDetails(
    'no chroot',
    'Generating C++ xrefs requires opening a folder with CrOS sources.',
    ...buttons
  );
}
