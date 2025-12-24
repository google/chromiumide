// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import {getDriver} from '../../../shared/app/common/driver_repository';
import * as config from '../../../shared/app/services/config';

const driver = getDriver();

// Checks if the CPU governor autocontrol feature of `cros build-packages` is
// enabled, and otherwise prompts to set it.

// When ~/.config/chromite/autosetgov file exists, `cros build-packages` command by default sets
// the cpu governor to 'performance' mode while building.
// For more details, see description of "--autosetgov" and "--autosetgov-sticky" in
// https://www.chromium.org/chromium-os/developer-library/guides/development/developer-guide/#build-the-packages-for-your-board
// and PSA https://groups.google.com/a/chromium.org/g/chromium-os-dev/c/HfED4NJ9W3M

const defaultChromiteConfigDir = path.join(os.homedir(), '.config', 'chromite');
const AUTOSETGOV_FILENAME = 'autosetgov';

const YES = 'Yes';
const NEVER = 'No (never show this again)';
const LATER = 'Later';

const onDidTrySuggestEmitter = new vscode.EventEmitter<void>();
const onDidTrySuggest = onDidTrySuggestEmitter.event;

export class Recommender implements vscode.Disposable {
  constructor(private readonly chromiteConfigDir = defaultChromiteConfigDir) {
    void (async () => {
      await this.trySuggest();
      onDidTrySuggestEmitter.fire();
    })();
  }

  dispose(): void {}

  private async trySuggest(): Promise<void> {
    try {
      if (fs.existsSync(this.getAutosetgovFilepath())) {
        return;
      }
    } catch (err) {
      void vscode.window.showErrorMessage(
        `failed to check autosetgov status: ${err}`
      );
      return;
    }
    const choice = await vscode.window.showInformationMessage(
      'Do you want to disable CPU powersaving mode while `cros build-packages` is running to speed up the build ([reference](https://groups.google.com/a/chromium.org/g/chromium-os-dev/c/HfED4NJ9W3M))? If you choose Yes, a file to instruct it will be created in your chromite config directory.',
      YES,
      NEVER,
      LATER
    );
    driver.metrics.send({
      category: 'background',
      group: 'misc',
      description: 'show autosetgov suggestion',
      name: 'misc_autosetgov_suggested',
    });
    if (choice === YES) {
      try {
        await this.makeAutosetgovFlagFileOrThrow();
      } catch (err) {
        void vscode.window.showErrorMessage((err as Error).message);
        return;
      }
      driver.metrics.send({
        category: 'interactive',
        group: 'misc',
        description: 'create autosetgov file',
        name: 'misc_autosetgov_activated',
      });
      void vscode.window.showInformationMessage(
        `Created ${this.getAutosetgovFilepath()}`
      );
    } else if (choice === NEVER) {
      await config.autosetgov.check.update(false);
    }
  }

  private async makeAutosetgovFlagFileOrThrow(): Promise<void> {
    try {
      await fs.promises.mkdir(this.chromiteConfigDir, {recursive: true});
    } catch (err) {
      switch ((err as {code?: unknown}).code) {
        case 'ENOTDIR':
          throw new Error(
            `Failed to create chromite config directory ${this.chromiteConfigDir}. Please check conflicting non-directory files.`
          );
        case 'EEXIST':
          break;
        default:
          throw new Error(
            `Failed to create chromite config directory ${this.chromiteConfigDir}: ${err}`
          );
      }
    }
    try {
      await fs.promises.writeFile(
        this.getAutosetgovFilepath(),
        '# Delete this file to turn off automatic performance governor switch.\n'
      );
    } catch (err) {
      throw new Error(
        `Failed to write ${this.getAutosetgovFilepath()}: ${err}`
      );
    }
  }

  private getAutosetgovFilepath(): string {
    return path.join(this.chromiteConfigDir, AUTOSETGOV_FILENAME);
  }
}

export const TEST_ONLY = {
  onDidTrySuggest: onDidTrySuggest,
};
