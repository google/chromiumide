// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * Keep all general utility functions here, or in common_util.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

/**
 * Returns VSCode executable given appRoot and the name of the executable under bin directory.
 * Returns Error if executable is not found.
 */
function findExecutable(appRoot: string, name: string): string | Error {
  let dir = appRoot;
  while (dir !== '/') {
    const exe = path.join(dir, 'bin', name);
    if (fs.existsSync(exe)) {
      return exe;
    }
    dir = path.dirname(dir);
  }
  return new Error(`${name} was not found for ${appRoot}`);
}

/**
 * Returns VSCode executable path, or error in case it's not found.
 */
export function vscodeExecutablePath(
  appRoot = vscode.env.appRoot,
  appName = vscode.env.appName,
  remoteName = vscode.env.remoteName
): string | Error {
  let executableName;
  // code-server's appName differs depending on the version.
  if (appName === 'code-server' || appName === 'Code - OSS') {
    executableName = 'code-server';
  } else if (appName === 'Visual Studio Code') {
    executableName = 'code';
  } else if (appName === 'Visual Studio Code - Insiders') {
    executableName = 'code-insiders';
  } else {
    return new Error(`VS Code app name not recognized: ${appName}`);
  }
  const executableSubPath =
    remoteName === 'ssh-remote'
      ? path.join('remote-cli', executableName)
      : executableName;

  return findExecutable(appRoot, executableSubPath);
}

export function isCodeServer(appHost = vscode.env.appHost): boolean {
  // vscode.env.appHost stores the hosted location of the application.
  // On desktop this is 'desktop'. In the web it is the specified embedder.
  // See https://code.visualstudio.com/api/references/vscode-api#env
  // TODO(b/232050207): Check if the IDE is run on code-server or on the
  //   desktop app more reliably.
  return appHost !== 'desktop';
}
