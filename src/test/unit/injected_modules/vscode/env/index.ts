// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {LogLevel} from '../log_level';
import {UIKind} from '../ui_kind';
import {FakeClipboard} from './clipboard';
import type * as vscode from 'vscode';

export const appHost = 'fakeAppHost' as string;
export const appName = 'fakeAppName' as string;
export const appRoot = 'fakeAppRoot' as string;
export const clipboard: vscode.Clipboard = new FakeClipboard();
export const isNewAppInstall = false as boolean;
export const isTelemetryEnabled = false as boolean;
export const language = 'en' as string;
export const logLevel: vscode.LogLevel = LogLevel.Debug;
export const machineId = 'fakeMachineId' as string;
export const remoteName: string | undefined = undefined;
export const sessionId = 'fakeSessionId' as string;
export const shell = 'fakeShell' as string;
export const uiKind = UIKind.Desktop as UIKind;
export const uriScheme = 'fake' as string;
