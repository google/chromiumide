// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as path from 'path';
import * as vscode from 'vscode';
import {ChromiumosServiceModule} from '../../services/chromiumos';
import {getTestingRsaPath} from './ssh_util';

/**
 * Manages SSH identity files needed to access managed DUTs.
 */
export class SshIdentity {
  private testingRsaPath: string;
  private partnerTestingRsaPath?: string;

  constructor(
    extensionUri: vscode.Uri,
    chromiumosServiceModule: ChromiumosServiceModule
  ) {
    // Add public identity file.
    this.testingRsaPath = getTestingRsaPath(extensionUri);

    // Add secret identity file if available.
    chromiumosServiceModule.onDidUpdate(e => {
      if (e) {
        this.partnerTestingRsaPath = getPartnerTestingRsaPath(e.root);
      } else {
        this.partnerTestingRsaPath = undefined;
      }
    });
  }

  get filePaths(): string[] {
    const res = [this.testingRsaPath];

    if (this.partnerTestingRsaPath) {
      res.push(this.partnerTestingRsaPath);
    }

    return res;
  }
}

function getPartnerTestingRsaPath(chromiumosRoot: string): string {
  return path.join(chromiumosRoot, 'sshkeys/partner_testing_rsa');
}
