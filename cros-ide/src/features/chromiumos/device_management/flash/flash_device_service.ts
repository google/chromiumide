// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {ExecResult} from '../../../../common/common_util';
import * as chroot from '../../../../services/chromiumos/chroot';
import * as model from './flash_device_model';

export class FlashDeviceService implements vscode.Disposable {
  constructor(
    private readonly chrootService: chroot.ChrootService,
    private readonly output: vscode.OutputChannel
  ) {}

  private readonly onProgressUpdateEmitter = new vscode.EventEmitter<number>();

  /**
   * Fire when flashing progress is updated, in the range [0.0, 1.0].
   */
  readonly onProgressUpdate = this.onProgressUpdateEmitter.event;

  private readonly subscriptions: vscode.Disposable[] = [
    this.onProgressUpdateEmitter,
  ];

  dispose() {
    vscode.Disposable.from(...this.subscriptions).dispose();
  }

  public async flashDevice(
    config: model.FlashDeviceViewState
  ): Promise<ExecResult | Error> {
    const xbuddyPath = this.buildXbuddyPath(config);

    // TODO(b/259722092): Before the bug is resolved, the output is our only progress indicator.
    this.output.show();

    const result = await chroot.execInChroot(
      this.chrootService.source.root,
      'cros',
      [
        'flash',
        '--log-level=debug',
        ...config.flashCliFlags,
        `ssh://${config.hostname}`,
        xbuddyPath,
      ],
      {
        sudoReason: 'to flash a device',
        logger: {
          append: line => {
            this.updateProgressFromOutput(line);
            this.output.append(line);
          },
        },
      }
    );
    return result;
  }

  /**
   * Builds the xbuddy path for the selected build parameters. The xbuddy path is a URI used with
   * the cros flash command.
   */
  public buildXbuddyPath(config: model.FlashDeviceViewState): string {
    const version =
      config.buildSelectionType === model.BuildSelectionType.SPECIFIC_BUILD
        ? `R${config.buildInfo?.chromeMilestone}-${config.buildInfo?.chromeOsVersion}`
        : 'latest';
    // The last part (image type) can be 'test', 'dev', 'base', 'recovery', or 'signed'.
    return `xbuddy://remote/${config.board}/${version}-${config.buildChannel}/test`;
  }

  /**
   * If the `cros flash` arg --log-level is set to at least info, this function can notify of
   * progress given each line of output from the CLI.
   *
   * TODO(b/259722092): Not working currently. Fix.
   */
  private updateProgressFromOutput(line: string): void {
    const match = line.match(/RootFS progress: (\d+\.?\d*)/s);
    if (match && match.length >= 2) {
      const progress = Number(match[1]);
      this.onProgressUpdateEmitter.fire(progress);

      // TODO(joelbecker): Obtain high-level progress messages from the output. E.g.:
      // } else if (line.match(/INFO: Rebooting/s)) {
      //   this.onProgressTextUpdateEmitter.fire('Rebooting Device...');
      // }
    }
  }
}
