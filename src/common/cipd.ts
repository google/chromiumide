// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import * as commonUtil from '../../shared/app/common/common_util';
import {extraEnvForDepotTools} from '../../shared/app/common/depot_tools';
import {getDriver} from '../../shared/app/common/driver_repository';
import {AbnormalExitError} from '../../shared/app/common/exec/types';
import * as config from '../../shared/app/services/config';
import {Mutex} from './mutex';

const driver = getDriver();

const defaultInstallDir = path.join(os.homedir(), '.cache/cros-ide/cipd');

const PINNED_CROSFLEET_VERSION = 'oPqW0LBfLgtbrMgoELmwMiUGJcTzykwnPupTLDJBDD0C';

/**
 * Interacts with CIPD CLI client (http://go/luci-cipd).
 *
 * It manages a repository of locally installed CIPD binaries. Call ensure*()
 * to download and install a CIPD package (if one is missing or stale) and
 * get its file path.
 */
export class CipdRepository {
  private readonly cipdMutex = new Mutex();

  constructor(readonly installDir = defaultInstallDir) {}

  private async ensurePackage(
    packageName: string,
    version: string,
    output: vscode.OutputChannel
  ): Promise<void> {
    const extraEnv = await extraEnvForDepotTools();

    const errorDetails = (error: Error) => {
      // We send only selected data to avoid capturing too much
      // (for example, home directory name).
      const data = [`pkg: ${packageName}`, `ver: ${version}`];
      if (error instanceof AbnormalExitError) {
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
            extraEnv,
          }
        );
        if (result instanceof Error) {
          const details = errorDetails(result);
          driver.metrics.send({
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
          extraEnv,
        }
      );
      if (result instanceof Error) {
        const details = errorDetails(result);
        driver.metrics.send({
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
      config.deviceManagement.usePinnedCrosfleet.get()
        ? PINNED_CROSFLEET_VERSION
        : 'prod',
      output
    );
    return path.join(this.installDir, 'crosfleet');
  }

  async ensureTriciumSpellchecker(
    output: vscode.OutputChannel
  ): Promise<string> {
    await this.ensurePackage(
      'infra/tricium/legacy_functions/spellchecker/linux-amd64',
      'latest',
      output
    );
    return path.join(this.installDir, 'spellchecker');
  }

  async ensureDirmd(output: vscode.OutputChannel): Promise<string> {
    await this.ensurePackage('infra/tools/dirmd/${platform}', 'latest', output);
    return path.join(this.installDir, 'dirmd');
  }
}
