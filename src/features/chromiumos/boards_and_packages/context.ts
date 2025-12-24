// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {ChrootService} from '../../../services/chromiumos';

export type Context = {
  chrootService: ChrootService;
  output: vscode.OutputChannel;
};
