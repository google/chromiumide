// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode'; // import types only

/**
 * An OutputChannel that discards logs.
 */
export class VoidOutputChannel implements vscode.LogOutputChannel {
  constructor(readonly name = 'void') {}

  logLevel = vscode.LogLevel.Info;
  onDidChangeLogLevel = new vscode.EventEmitter<vscode.LogLevel>().event;

  trace(_message: string, ..._args: unknown[]): void {}
  debug(_message: string, ..._args: unknown[]): void {}
  info(_message: string, ..._args: unknown[]): void {}
  warn(_message: string, ..._args: unknown[]): void {}
  error(_error: string | Error, ..._args: unknown[]): void {}

  append(): void {}
  appendLine(): void {}
  replace(): void {}
  clear(): void {}
  show(): void {}
  hide(): void {}
  dispose(): void {}
}

/**
 * An OutputChannel that sends logs to console.
 */
export class ConsoleOutputChannel implements vscode.LogOutputChannel {
  constructor(readonly name = 'console') {}

  readonly logLevel = vscode.LogLevel.Info;
  readonly onDidChangeLogLevel = new vscode.EventEmitter<vscode.LogLevel>()
    .event;

  append(value: string): void {
    process.stdout.write(value);
  }
  appendLine(value: string): void {
    process.stdout.write(`${value}\n`);
  }

  private log(
    level: vscode.LogLevel,
    message: string | Error,
    ...args: unknown[]
  ): void {
    if (level >= this.logLevel) {
      this.appendLine([message, ...args].join(' '));
    }
  }

  trace(message: string, ...args: unknown[]): void {
    this.log(vscode.LogLevel.Trace, message, ...args);
  }
  debug(message: string, ...args: unknown[]): void {
    this.log(vscode.LogLevel.Debug, message, ...args);
  }
  info(message: string, ...args: unknown[]): void {
    this.log(vscode.LogLevel.Info, message, ...args);
  }
  warn(message: string, ...args: unknown[]): void {
    this.log(vscode.LogLevel.Warning, message, ...args);
  }
  error(error: string | Error, ...args: unknown[]): void {
    this.log(vscode.LogLevel.Error, error, ...args);
  }

  replace(): void {}
  clear(): void {}
  show(): void {}
  hide(): void {}
  dispose(): void {}
}
