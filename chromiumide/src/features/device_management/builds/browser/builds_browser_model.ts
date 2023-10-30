// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {PrebuildInfo} from '../build_model';

/** State of the builds browser UI. */
export type BuildsBrowserState = {
  /** Board to filter builds on. */
  readonly board: string;

  /** The builds info. */
  readonly builds: PrebuildInfo[];

  /** True if builds are being loaded or refreshed. */
  readonly loadingBuilds: boolean;
};

export interface UpdateBuildsBrowserState {
  command: 'UpdateBuildsBrowserState';
  readonly state: BuildsBrowserState;
}

/** Messages sent to the builds browser webview. */
export type BuildsBrowserPanelMessage = UpdateBuildsBrowserState;

export interface BuildChosen {
  command: 'BuildChosen';
  readonly buildInfo: PrebuildInfo;
}

export interface LoadBuilds {
  command: 'LoadBuilds';
}

/** Messages sent from the builds browser webview. */
export type BuildsBrowserViewMessage = LoadBuilds | BuildChosen;
