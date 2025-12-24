// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {Event} from '../app/common/metrics/metrics_event';

export type Metrics = Readonly<{
  activate(context: vscode.ExtensionContext): Promise<void>;
  send(event: Event): void;
}>;
