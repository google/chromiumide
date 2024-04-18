// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as shutil from '../shutil';

export interface ExecResult {
  exitStatus: number | null;
  stdout: string;
  stderr: string;
}

/*
 * The nodejs child_process module takes NodeJS.ProcessEnv for the env parameter whose value could
 * be string | undefined.
 * The equivalent parameter taken by the cider connector module is a Record<string, string>. The
 * entries with undefined value will be discarded when on the driver implementation level.
 */
export type ProcessEnv = Record<string, string | undefined>;

export interface ExecOptions {
  /**
   * When set, outputs are logged with this function.
   * Usually this is a vscode.OutputChannel object, but only append() is required.
   */
  logger?: Pick<vscode.OutputChannel, 'append'>;

  /** If true, stdout should be logged in addition to stderr, which is always logged. */
  logStdout?: boolean;

  /**
   * If the command exits with non-zero code, exec should return normally.
   * This changes the default behaviour, which is to return an error.
   */
  ignoreNonZeroExit?: boolean;

  /**
   * When set, pipeStdin is written to the stdin of the command.
   */
  pipeStdin?: string;

  /**
   * Allows interrupting a command execution.
   */
  cancellationToken?: vscode.CancellationToken;

  /**
   * Whether to kill the entire process tree when cancelling the operation. Defaults to `false`.
   *
   * TODO(b/301574822): Consider removing this option and instead default to `true` for all
   * commands.
   */
  treeKillWhenCancelling?: boolean;

  /**
   * Current working directory of the child process.
   */
  cwd?: string;

  /**
   * Environment variables passed to the subprocess.
   */
  env?: ProcessEnv;
}

/**
 * Command was run, returned non-zero exit status,
 * and `exec` option was to return an error.
 */
export class AbnormalExitError extends Error {
  constructor(
    cmd: string,
    args: string[],
    readonly exitStatus: number | null,
    readonly stdout: string,
    readonly stderr: string
  ) {
    super(
      `"${shutil.escapeArray([
        cmd,
        ...args,
      ])}" failed, exit status: ${exitStatus}`
    );
  }

  messageWithStdoutAndStderr(): string {
    return `${this.message}\nStdout:\n${this.stdout}\nStderr:\n${this.stderr}`;
  }
}

export class SudoError extends AbnormalExitError {
  constructor(
    cmd: string,
    args: string[],
    override readonly stdout: string,
    override readonly stderr: string
  ) {
    super(cmd, args, 1, stdout, stderr);
  }
}

/**
 * Command did not run, for example, it was not found.
 */
export class ProcessError extends Error {
  constructor(cmd: string, args: string[], cause: Error) {
    // Chain errors with `cause` option is not available.
    super(`"${shutil.escapeArray([cmd, ...args])}" failed: ${cause.message}`);
  }
}

/**
 * Command execution was interrupted with vscode.CancellationToken.
 */
export class CancelledError extends vscode.CancellationError {
  override readonly message = `"${shutil.escapeArray([
    this.cmd,
    ...this.args,
  ])}" cancelled`;
  constructor(private readonly cmd: string, private readonly args: string[]) {
    super();
  }
}
