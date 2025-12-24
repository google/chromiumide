// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as path from 'path';
import * as vscode from 'vscode';
import * as services from '../../../services';
import {TestControllerSingleton} from '../../gtest/test_controller_singleton';
import {Config} from './config';
import {RunProfile} from './run_profile';

export class Platform2Gtest implements vscode.Disposable {
  constructor(
    private readonly chromiumosRoot: string,
    private readonly chrootService: services.chromiumos.ChrootService
  ) {}

  private readonly cfg: Config = {
    platform2: path.join(this.chromiumosRoot, 'src/platform2'),
    chrootService: this.chrootService,
    testControllerRepository: new TestControllerSingleton(
      'chromiumide.platform2Gtest',
      'platform2 gtest'
    ),
  };

  private readonly subscriptions: vscode.Disposable[] = [
    this.cfg.testControllerRepository,
    new RunProfile(this.cfg),
  ];
  dispose(): void {
    vscode.Disposable.from(...this.subscriptions.reverse()).dispose();
  }

  getTestControllerForTesting(): vscode.TestController {
    return this.cfg.testControllerRepository.getOrCreate();
  }
}
