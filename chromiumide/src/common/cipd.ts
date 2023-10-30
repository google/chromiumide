// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import {Metrics} from '../features/metrics/metrics';
import * as commonUtil from './common_util';
import * as depotTools from './depot_tools';

const defaultInstallDir = path.join(os.homedir(), '.cache/cros-ide/cipd');

/**
 * Interacts with CIPD CLI client (http://go/luci-cipd).
 *
 * It manages a repository of locally installed CIPD binaries. Call ensure*()
 * to download and install a CIPD package (if one is missing or stale) and
 * get its file path.
 */
export class CipdRepository {
  private readonly cipdMutex = new commonUtil.Mutex();

  constructor(readonly installDir = defaultInstallDir) {}

  private async ensurePackage(
    packageName: string,
    version: string,
    output: vscode.OutputChannel
  ): Promise<void> {
    const env = depotTools.envForDepotTools();

    const errorDetails = (error: Error) => {
      // We send only selected data to avoid capturing too much
      // (for example, home directory name).
      const data = [`pkg: ${packageName}`, `ver: ${version}`];
      if (error instanceof commonUtil.AbnormalExitError) {
        data.push(`status: ${error.exitStatus}`);
      }
      return data.join(', ');
    };

    await this.cipdMutex.runExclusive(async () => {
      if (!fs.existsSync(path.join(this.installDir, '.cipd'))) {
        const result = await commonUtil.exec(
          'cipd',
          ['init', this.installDir, '-force'],
          {
            logger: output,
            env,
          }
        );
        if (result instanceof Error) {
          const details = errorDetails(result);
          Metrics.send({
            category: 'error',
            group: 'cipd',
            description: `call to 'cipd init' failed, details: ${details}`,
            name: 'cipd_init_failed',
          });
          throw result;
        }
      }

      const result = await commonUtil.exec(
        'cipd',
        ['install', '-root', this.installDir, packageName, version],
        {
          logger: output,
          logStdout: true,
          env,
        }
      );
      if (result instanceof Error) {
        const details = errorDetails(result);
        Metrics.send({
          category: 'error',
          group: 'cipd',
          description: `call to 'cipd install' failed, details: ${details}`,
          name: 'cipd_install_failed',
        });
        throw result;
      }
    });
  }

  async ensureCrosfleet(output: vscode.OutputChannel): Promise<string> {
    await this.ensurePackage(
      'chromiumos/infra/crosfleet/${platform}',
      'prod',
      output
    );
    return path.join(this.installDir, 'crosfleet');
  }

  async ensureTriciumSpellchecker(
    output: vscode.OutputChannel
  ): Promise<string> {
    await this.ensurePackage(
      'infra/tricium/function/spellchecker',
      'live',
      output
    );
    return path.join(this.installDir, 'spellchecker');
  }
}
