// Copyright 2022 The ChromiumOS Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import * as commonUtil from '../common/common_util';
import * as metrics from '../features/metrics/metrics';
import * as bgTaskStatus from '../ui/bg_task_status';
import * as logs from '../logs';
import * as config from '../services/config';

export function activate(
  context: vscode.ExtensionContext,
  statusManager: bgTaskStatus.StatusManager,
  log: logs.LoggingBundle
) {
  const collection = vscode.languages.createDiagnosticCollection('cros-lint');
  if (vscode.window.activeTextEditor) {
    updateCrosLintDiagnostics(
      vscode.window.activeTextEditor.document,
      collection,
      statusManager,
      log
    );
  }
  // TODO(ttylenda): Add integration test to verify that we run linters on events.
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(document => {
      updateCrosLintDiagnostics(document, collection, statusManager, log);
    })
  );
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(document => {
      updateCrosLintDiagnostics(document, collection, statusManager, log);
    })
  );
  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument(document => {
      collection.delete(document.uri);
    })
  );
}

/** Describes how to run a linter and parse its output. */
interface LintConfig {
  /**
   * Returns the executable name to lint the realpath. It returns undefined in case linter is not found.
   */
  executable(realpath: string): string | undefined;
  arguments(path: string): string[];
  parse(
    stdout: string,
    stderr: string,
    document: vscode.TextDocument
  ): vscode.Diagnostic[];
  /**
   * Returns the cwd to run the executable.
   */
  cwd?(exePath: string): string | undefined;
  env?(exePath: string, path: string): Promise<NodeJS.ProcessEnv | undefined>;
}

const GNLINT_PATH = 'src/platform2/common-mk/gnlint.py';
const TAST_LINT_PATH = 'src/platform/tast/tools/run_lint.sh';
const TAST_PATH_RE = /^.*\/tast\/.*/;
const CROS_PATH = 'chromite/bin/cros';

function crosExeFor(realpath: string): string | undefined {
  const chroot = commonUtil.findChroot(realpath);
  if (chroot === undefined) {
    return undefined;
  }
  const source = commonUtil.sourceDir(chroot);
  return path.join(source, CROS_PATH);
}

// Don't forget to update package.json when adding more languages.
const lintConfigs = new Map<string, LintConfig>([
  [
    'cpp',
    {
      executable: realpath => crosExeFor(realpath),
      arguments: (path: string) => ['lint', path],
      parse: parseCrosLintCpp,
    },
  ],
  [
    'gn',
    {
      executable: realpath => {
        const chroot = commonUtil.findChroot(realpath);
        if (chroot === undefined) {
          return undefined;
        }
        const source = commonUtil.sourceDir(chroot);
        return path.join(source, GNLINT_PATH);
      },
      arguments: (path: string) => [path],
      parse: parseCrosLintGn,
      // gnlint.py needs to be run inside ChromiumOS source tree,
      // otherwise it complains about formatting.
      cwd: (exePath: string) => path.dirname(exePath),
    },
  ],
  [
    'python',
    {
      executable: realpath => crosExeFor(realpath),
      arguments: (path: string) => ['lint', path],
      parse: parseCrosLintPython,
    },
  ],
  [
    'shellscript',
    {
      executable: realpath => crosExeFor(realpath),
      arguments: (path: string) => ['lint', '--output=parseable', path],
      parse: parseCrosLintShell,
    },
  ],
  [
    'go',
    {
      executable: realpath => {
        if (!TAST_PATH_RE.test(realpath)) {
          return crosExeFor(realpath);
        }
        const chroot = commonUtil.findChroot(realpath);
        if (chroot === undefined) {
          return undefined;
        }
        const source = commonUtil.sourceDir(chroot);
        return path.join(source, TAST_LINT_PATH);
      },
      arguments: (path: string) =>
        TAST_PATH_RE.test(path) ? [path] : ['lint', path],
      parse: parseCrosLintGo,
      cwd: (exePath: string) =>
        TAST_PATH_RE.test(exePath)
          ? path.dirname(path.dirname(exePath))
          : undefined,
      env: (execPath: string) => goLintEnv(execPath),
    },
  ],
]);

// TODO(b/241434614): Remove goLintEnv function once cros lint bug is resolved.
/**
 * Configures environment variables to be passed to a subprocess for linting.
 *
 * Returns a NodeJS.ProcessEnv with the environment variables required for the exe to run.
 * Returns undefined if the environment is unable to be configured or if the environment does
 * not need to be modified.
 */
export async function goLintEnv(
  exe: string
): Promise<NodeJS.ProcessEnv | undefined> {
  const env = Object.assign({}, process.env);
  const goCrosLint = exe.endsWith('cros');
  if (!goCrosLint) {
    return undefined;
  }
  // Find golint executable in the chroot because cros lint
  // checks /usr/bin, where the chroot golint is located.
  const chroot = commonUtil.findChroot(exe);
  if (chroot === undefined) {
    return undefined;
  }
  const goBin = path.join(chroot, '/usr/bin');
  // Add goBin to the PATH so that cros lint can lint go files
  // outside the chroot.
  const newPathVar = `${env.PATH}:${goBin}`;
  const toolsGopathConfig = config.goExtension.toolsGopath.get();
  return toolsGopathConfig === null
    ? {PATH: newPathVar}
    : {PATH: `${toolsGopathConfig}:${newPathVar}`};
}

// TODO(ttylenda): Consider making it a class and move statusManager and log to the constructor.
async function updateCrosLintDiagnostics(
  document: vscode.TextDocument,
  collection: vscode.DiagnosticCollection,
  statusManager: bgTaskStatus.StatusManager,
  log: logs.LoggingBundle
): Promise<void> {
  if (document && document.uri.scheme === 'file') {
    const lintConfig = lintConfigs.get(document.languageId);
    if (!lintConfig) {
      // Sent metrics just to track languages.
      metrics.send({
        category: 'background',
        group: 'lint',
        action: 'skip',
        label: document.languageId,
      });
      return;
    }
    const realpath = await fs.promises.realpath(document.uri.fsPath);
    const name = lintConfig.executable(realpath);
    if (!name) {
      log.channel.append(
        `Could not find lint executable for ${document.uri.fsPath}\n`
      );
      return;
    }
    const args = lintConfig.arguments(realpath);
    const cwd = lintConfig.cwd?.(name);
    const env = await lintConfig.env?.(name, realpath);
    const res = await commonUtil.exec(name, args, {
      logger: log.channel,
      ignoreNonZeroExit: true,
      logStdout: true,
      cwd: cwd,
      env: env,
    });
    if (res instanceof Error) {
      log.channel.append(res.message);
      statusManager.setTask(log.taskId, {
        status: bgTaskStatus.TaskStatus.ERROR,
        command: log.showLogCommand,
      });
      return;
    }
    const {stdout, stderr} = res;
    const diagnostics = lintConfig.parse(stdout, stderr, document);
    collection.set(document.uri, diagnostics);
    if (res.exitStatus !== 0 && diagnostics.length === 0) {
      log.channel.append(
        `lint command returned ${res.exitStatus}, but no diagnostics were parsed by CrOS IDE\n`
      );
      statusManager.setTask(log.taskId, {
        status: bgTaskStatus.TaskStatus.ERROR,
        command: log.showLogCommand,
      });
      metrics.send({
        category: 'error',
        group: 'lint',
        description: 'non-zero linter exit, but no diagnostics',
      });
      return;
    }
    statusManager.setTask(log.taskId, {
      status: bgTaskStatus.TaskStatus.OK,
      command: log.showLogCommand,
    });
    metrics.send({
      category: 'background',
      group: 'lint',
      action: 'update',
      label: document.languageId,
      value: diagnostics.length,
    });
  }
}

function sameFile(documentFsPath: string, crosLintPath: string): boolean {
  return path.basename(documentFsPath) === path.basename(crosLintPath);
}

export function parseCrosLintCpp(
  stdout: string,
  stderr: string,
  document: vscode.TextDocument
): vscode.Diagnostic[] {
  const lineRE = /^([^ \n]+):([0-9]+): {2}(.*) {2}\[([^ ]+)\] \[([1-5])\]/gm;
  const diagnostics: vscode.Diagnostic[] = [];
  let match: RegExpExecArray | null;
  // stdout and stderr are merged, because we saw that warnings can go to
  // either.
  // TODO(b/214322467): Figure out when we should use stderr and when stdout.
  while ((match = lineRE.exec(stdout + '\n' + stderr)) !== null) {
    const file = match[1];
    let line = Number(match[2]);
    // Warning about missing copyright is reported at hard coded line 0.
    // This seems like a bug in cpplint.py, which otherwise uses 1-based
    // line numbers.
    if (line === 0) {
      line = 1;
    }
    const message = match[3];
    if (sameFile(document.uri.fsPath, file)) {
      diagnostics.push(createDiagnostic(message, line));
    }
  }
  return diagnostics;
}

// Parse output from platform2/common-mk/gnlint.py on a GN file.
export function parseCrosLintGn(
  _stdout: string,
  stderr: string,
  document: vscode.TextDocument
): vscode.Diagnostic[] {
  // Only the errors that have location in the file are captured.
  // There are two categories of errors without line/column number:
  // - file not formatted by gn-format: should do auto-format upon save
  // - wrong commandline arguments: should be covered by extension unit test
  // So these are ignored.
  const lineRE = /ERROR: ([^ \n:]+):([0-9]+):([0-9]+): (.*)/gm;
  const diagnostics: vscode.Diagnostic[] = [];
  let match: RegExpExecArray | null;
  while ((match = lineRE.exec(stderr)) !== null) {
    const file = match[1];
    const line = Number(match[2]);
    const startCol = Number(match[3]);
    const message = match[4];
    // Keep the same logic for matching file names,
    // although here it effectively no-op (always BUILD.gn)
    if (sameFile(document.uri.fsPath, file)) {
      diagnostics.push(createDiagnostic(message, line, startCol));
    }
  }
  return diagnostics;
}

// Parse output from cros lint on Python files
export function parseCrosLintPython(
  stdout: string,
  _stderr: string,
  document: vscode.TextDocument
): vscode.Diagnostic[] {
  const lineRE = /^([^ \n:]+):([0-9]+):([0-9]+): (.*)/gm;
  const diagnostics: vscode.Diagnostic[] = [];
  let match: RegExpExecArray | null;
  while ((match = lineRE.exec(stdout)) !== null) {
    const file = match[1];
    const line = Number(match[2]);
    // Column number from the python linter is 0-based.
    const startCol = Number(match[3]) + 1;
    const message = match[4];
    if (sameFile(document.uri.fsPath, file)) {
      diagnostics.push(createDiagnostic(message, line, startCol));
    }
  }
  return diagnostics;
}

// Parse output from cros lint --output=parseable on shell files.
export function parseCrosLintShell(
  stdout: string,
  _stderr: string,
  document: vscode.TextDocument
): vscode.Diagnostic[] {
  const lineRE = /^([^ \n:]+):([0-9]+):([0-9]+): (.*)/gm;
  const diagnostics: vscode.Diagnostic[] = [];
  let match: RegExpExecArray | null;
  while ((match = lineRE.exec(stdout)) !== null) {
    const file = match[1];
    const line = Number(match[2]);
    const startCol = Number(match[3]);
    const message = match[4];
    if (sameFile(document.uri.fsPath, file)) {
      diagnostics.push(createDiagnostic(message, line, startCol));
    }
  }
  return diagnostics;
}

export function parseCrosLintGo(
  stdout: string,
  _stderr: string,
  document: vscode.TextDocument
): vscode.Diagnostic[] {
  const lineRE = /([^\s]+.go):(\d+):(\d+): (.*)/gm;
  const diagnostics: vscode.Diagnostic[] = [];
  let match: RegExpExecArray | null;
  while ((match = lineRE.exec(stdout)) !== null) {
    const file = match[1];
    const line = Number(match[2]);
    const startCol = Number(match[3]);
    const message = match[4];
    if (sameFile(document.uri.fsPath, file)) {
      diagnostics.push(createDiagnostic(message, line, startCol));
    }
  }
  return diagnostics;
}

// Creates Diagnostic message.
// line and startCol are both 1-based.
function createDiagnostic(
  message: string,
  line: number,
  startCol?: number
): vscode.Diagnostic {
  return new vscode.Diagnostic(
    new vscode.Range(
      new vscode.Position(line - 1, startCol ? startCol - 1 : 0),
      new vscode.Position(line - 1, Number.MAX_VALUE)
    ),
    message,
    // TODO(b/214322467): Should these actually be errors when they block
    // repo upload?
    vscode.DiagnosticSeverity.Warning
  );
}
