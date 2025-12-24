// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {Connection} from 'vscode-languageserver';
import {InitializationOptions} from './shared/constants';
import {VirtualFileSystem} from './virtual_file_system';

export type Context = {
  initializationOptions: InitializationOptions;
  fs: VirtualFileSystem;
  connection: Connection;
};
