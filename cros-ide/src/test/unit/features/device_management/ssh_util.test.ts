// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import 'jasmine';
import * as vscode from 'vscode';
import * as sshUtil from '../../../../features/device_management/ssh_util';

describe('SSH utility', () => {
  it('computes SSH arguments for host without port number', () => {
    const args = sshUtil.buildSshCommand(
      'somehost',
      vscode.Uri.parse('file:///path/to/extension'),
      ['-o', 'SomeOption=on'],
      'true'
    );
    expect(args).toEqual([
      'ssh',
      '-i',
      '/path/to/extension/resources/testing_rsa',
      '-o',
      'StrictHostKeyChecking=no',
      '-o',
      'UserKnownHostsFile=/dev/null',
      '-o',
      'SomeOption=on',
      'root@somehost',
      'true',
    ]);
  });

  it('computes SSH arguments for host with port number', () => {
    const args = sshUtil.buildSshCommand(
      'somehost:12345',
      vscode.Uri.parse('file:///path/to/extension'),
      ['-o', 'SomeOption=on'],
      'true'
    );
    expect(args).toEqual([
      'ssh',
      '-i',
      '/path/to/extension/resources/testing_rsa',
      '-o',
      'StrictHostKeyChecking=no',
      '-o',
      'UserKnownHostsFile=/dev/null',
      '-p',
      '12345',
      '-o',
      'SomeOption=on',
      'root@somehost',
      'true',
    ]);
  });
});
