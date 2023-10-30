// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import * as commonUtil from '../common/common_util';
import {Metrics} from '../features/metrics/metrics';
import * as logs from '../logs';
import * as services from '../services';
import * as config from '../services/config';
import * as bgTaskStatus from '../ui/bg_task_status';
import {TaskStatus} from '../ui/bg_task_status';

export function activate(
  context: vscode.ExtensionContext,
  statusManager: bgTaskStatus.StatusManager,
  log: logs.LoggingBundle
): void {
  const collection = vscode.languages.createDiagnosticCollection('cros-lint');
  if (vscode.window.activeTextEditor) {
    void updateDiagnosticsWrapper(
      vscode.window.activeTextEditor.document,
      collection,
      statusManager,
      log
    );
  }
  // TODO(ttylenda): Add integration test to verify that we run linters on events.
  const textEditorsWatcher = services.TextEditorsWatcher.singleton();
  context.subscriptions.push(
    textEditorsWatcher.onDidActivate(document => {
      void updateDiagnosticsWrapper(document, collection, statusManager, log);
    })
  );
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(document => {
      void updateDiagnosticsWrapper(document, collection, statusManager, log);
    })
  );
  context.subscriptions.push(
    textEditorsWatcher.onDidClose(document => {
      collection.delete(document.uri);
    })
  );
}

/** Describes how to run a linter and parse its output. */
interface LintConfig {
  /**
   * Returns the executable name to lint the realpath. It returns undefined in case linter should not be applied.
   */
  executable(realpath: string): Promise<string | undefined>;
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

  // If true, allow empty diagnostics even when linter returned non-zero exit code.
  // Otherwise, such case is raised to an IDE error status.
  ignoreEmptyDiagnostics?: boolean | undefined;
}

const TAST_RE = /^.*\/platform\/(tast-tests-private|tast-tests|tast).*/;
const CROS_PATH = 'chromite/bin/cros';
const CHECK_LIBCHROME_PATH =
  'src/platform/libchrome/libchrome_tools/developer-tools/presubmit/check-libchrome.py';
// List of directories whose files should be run against check-libchrome.py.
const CHECK_LIBCHROME_SRC_DIRS = [
  'src/aosp/packages/modules/Bluetooth/',
  'src/aosp/frameworks/ml/',
  'src/aosp/system/update_engine/',
  'src/partner_private/brother_mlaser/',
  'src/partner_private/fibocom-firmware/',
  'src/partner_private/huddly/',
  'src/platform2/',
  'src/platform/',
  'src/third_party/atrusctl/',
  'src/third_party/virtual_usb_printer/',
];

async function crosExeFor(realpath: string): Promise<string | undefined> {
  const chroot = commonUtil.findChroot(realpath);
  if (chroot === undefined) {
    return undefined;
  }
  const source = commonUtil.sourceDir(chroot);
  return path.join(source, CROS_PATH);
}

// Don't forget to update package.json when adding more languages.
const languageToLintConfigs = new Map<string, LintConfig[]>([
  [
    'cpp',
    [
      {
        executable: realpath => crosExeFor(realpath),
        arguments: (path: string) => ['lint', path],
        parse: parseCrosLintCpp,
      },
      {
        executable: async realpath => {
          const chroot = commonUtil.findChroot(realpath);
          if (chroot === undefined) {
            return undefined;
          }
          const source = commonUtil.sourceDir(chroot);
          const filepath = realpath.slice(source.length + 1); // To trim / of source dir
          for (const dir of CHECK_LIBCHROME_SRC_DIRS) {
            if (filepath.startsWith(dir)) {
              return path.join(source, CHECK_LIBCHROME_PATH);
            }
          }
          return undefined;
        },
        arguments: (path: string) => [path],
        parse: parseLibchromeCheck,
      },
    ],
  ],
  [
    'gn',
    [
      {
        executable: realpath => crosExeFor(realpath),
        arguments: (path: string) => ['lint', path],
        parse: parseCrosLintGn,
        // gnlint.py needs to be run inside ChromiumOS source tree,
        // otherwise it complains about formatting.
        cwd: (exePath: string) => path.dirname(exePath),
        // gnlint.py exits with non-zero code when syntax error exists,
        // but not handled here because those overlap with other exetnsions.
        ignoreEmptyDiagnostics: true,
      },
    ],
  ],
  [
    'python',
    [
      {
        executable: realpath => crosExeFor(realpath),
        arguments: (path: string) => ['lint', path],
        parse: parseCrosLintPython,
        // The linter exits with non-zero code when the file is not auto-formatted.
        ignoreEmptyDiagnostics: true,
      },
    ],
  ],
  [
    'shellscript',
    [
      {
        executable: realpath => crosExeFor(realpath),
        arguments: (path: string) => ['lint', '--output=parseable', path],
        parse: parseCrosLintShell,
      },
    ],
  ],
  [
    'go',
    [
      {
        executable: realpath =>
          !TAST_RE.test(realpath)
            ? crosExeFor(realpath)
            : tastLintExe(realpath),
        arguments: (path: string) =>
          TAST_RE.test(path) ? [path] : ['lint', path],
        parse: parseCrosLintGo,
        cwd: (exePath: string) =>
          TAST_RE.test(exePath)
            ? path.dirname(path.dirname(exePath))
            : undefined,
        env: (execPath: string) => goLintEnv(execPath),
        // run_lint.sh exits with non-zero status when the file cannot be parsed,
        // which happens often when the code is edited.
        ignoreEmptyDiagnostics: true,
      },
    ],
  ],
]);

async function tastLintExe(realPath: string): Promise<string | undefined> {
  const goFound = await checkForGo();
  if (!goFound) {
    return undefined;
  }
  // Return the right linting exe for the tast repo.
  const match = TAST_RE.exec(realPath);
  if (!match) {
    return undefined;
  }
  const linterPath = `src/platform/${match[1]}/tools/run_lint.sh`;
  const chroot = commonUtil.findChroot(realPath);
  if (chroot === undefined) {
    return undefined;
  }
  const source = commonUtil.sourceDir(chroot);
  return path.join(source, linterPath);
}

let goWarningShown = false;
async function checkForGo(): Promise<boolean> {
  // Go needs to be installed for tast linter to work.
  const res = await commonUtil.exec('which', ['go']);
  if (!(res instanceof Error)) {
    return true;
  }
  if (goWarningShown) {
    return false;
  }
  goWarningShown = true;
  // Suggest the user install go.
  const choice = await vscode.window.showInformationMessage(
    '*** Linting Tast repos requires the Golang go command. Please install the "go" command (Go language) to a location listed in $PATH.',
    'Troubleshoot'
  );
  if (choice) {
    void vscode.env.openExternal(
      vscode.Uri.parse('http://go/chromiumide-doc-go-not-found')
    );
  }
  return false;
}

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
  let newPathVar = `${env.PATH}:${goBin}`;
  // Prepend go.toolsGopath if available
  if (vscode.extensions.getExtension('golang.Go')) {
    const toolsGopathConfig = config.goExtension.toolsGopath.get();
    if (toolsGopathConfig) {
      newPathVar = `${toolsGopathConfig}:${newPathVar}`;
    }
  }

  return {PATH: newPathVar};
}

// Wrapper to handle any errors thrown by updateDiagnostics.
async function updateDiagnosticsWrapper(
  document: vscode.TextDocument,
  collection: vscode.DiagnosticCollection,
  statusManager: bgTaskStatus.StatusManager,
  log: logs.LoggingBundle
): Promise<void> {
  try {
    await updateDiagnostics(document, collection, statusManager, log);
  } catch (err) {
    log.channel.append(`${err}\n`);
    statusManager.setTask(log.taskId, {
      status: TaskStatus.ERROR,
      command: log.showLogCommand,
    });
    Metrics.send({
      category: 'error',
      group: 'lint',
      description: 'error was thrown',
      name: 'lint_update_diagnostic_error',
    });
  }
}

// TODO(ttylenda): Consider making it a class and move statusManager and log to the constructor.
async function updateDiagnostics(
  document: vscode.TextDocument,
  collection: vscode.DiagnosticCollection,
  statusManager: bgTaskStatus.StatusManager,
  log: logs.LoggingBundle
): Promise<void> {
  if (document && document.uri.scheme === 'file') {
    const lintConfigs = languageToLintConfigs.get(document.languageId);
    if (!lintConfigs) {
      // Sent metrics just to track languages.
      Metrics.send({
        category: 'background',
        group: 'lint',
        description: 'skip',
        name: 'lint_skip',
        language_id: document.languageId,
      });
      return;
    }
    const realpath = await fs.promises.realpath(document.uri.fsPath);

    // Do not lint generated files, because it generates lots of useless warnings.
    if (
      realpath.includes('/chroot/build/') ||
      realpath.includes('/out/build/')
    ) {
      return;
    }

    const diagnosticsCollection: vscode.Diagnostic[] = [];
    for (const lintConfig of lintConfigs) {
      const name = await lintConfig.executable(realpath);
      if (!name) {
        log.channel.append(
          `Do not apply lint executable for ${document.uri.fsPath}\n`
        );
        continue;
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
          status: TaskStatus.ERROR,
          command: log.showLogCommand,
        });
        return;
      }
      const {stdout, stderr} = res;
      const diagnostics = lintConfig.parse(stdout, stderr, document);
      if (res.exitStatus !== 0 && diagnostics.length === 0) {
        log.channel.append(
          `lint command returned ${res.exitStatus}, but no diagnostics were parsed by ChromiumIDE\n`
        );
        if (!lintConfig.ignoreEmptyDiagnostics) {
          statusManager.setTask(log.taskId, {
            status: TaskStatus.ERROR,
            command: log.showLogCommand,
          });
          Metrics.send({
            category: 'error',
            group: 'lint',
            description: `non-zero linter exit, but no diagnostics (${document.languageId})`,
            name: 'lint_missing_diagnostics',
          });
          return;
        }
      }
      diagnosticsCollection.push(...diagnostics);
    }

    collection.set(document.uri, diagnosticsCollection);
    statusManager.setTask(log.taskId, {
      status: TaskStatus.OK,
      command: log.showLogCommand,
    });
    Metrics.send({
      category: 'background',
      group: 'lint',
      description: 'update',
      name: 'lint_update',
      language_id: document.languageId,
      length: diagnosticsCollection.length,
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
      diagnostics.push(createDiagnostic(message, 'CrOS lint', line));
    }
  }
  return diagnostics;
}

export function parseLibchromeCheck(
  stdout: string,
  stderr: string,
  document: vscode.TextDocument
): vscode.Diagnostic[] {
  const lineRE =
    /^In File (.+) line ([0-9]+) col ([0-9]+), found .+ \(pattern: .+\), (.+)/gm;
  const diagnostics: vscode.Diagnostic[] = [];
  let match: RegExpExecArray | null;
  while ((match = lineRE.exec(stderr)) !== null) {
    const file = match[1];
    const line = Number(match[2]);
    const startCol = Number(match[3]);
    const message = match[4];
    if (sameFile(document.uri.fsPath, file)) {
      diagnostics.push(
        createDiagnostic(message, 'CrOS libchrome', line, startCol)
      );
    }
  }
  return diagnostics;
}

// Parse output from platform2/common-mk/gnlint.py on a GN file.
export function parseCrosLintGn(
  stdout: string,
  _stderr: string,
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
  while ((match = lineRE.exec(stdout)) !== null) {
    const file = match[1];
    const line = Number(match[2]);
    const startCol = Number(match[3]);
    const message = match[4];
    // Keep the same logic for matching file names,
    // although here it effectively no-op (always BUILD.gn)
    if (sameFile(document.uri.fsPath, file)) {
      diagnostics.push(
        createDiagnostic(message, 'CrOS GN lint', line, startCol)
      );
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
      diagnostics.push(createDiagnostic(message, 'CrOS lint', line, startCol));
    }
  }
  return diagnostics;
}

// Parse output from cros lint --output=parseable on shell files.
export function parseCrosLintShell(
  stdout: string,
  stderr: string,
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
      diagnostics.push(createDiagnostic(message, 'CrOS lint', line, startCol));
    }
  }

  const stderrLineRE =
    /[0-9]+:[0-9]+:[0-9]+: WARNING:([^\n:]+):(([0-9]+):)? (.*)/gm;
  while ((match = stderrLineRE.exec(stderr)) !== null) {
    const file = match[1];
    const message = match[4];
    let line: number;
    if (match[3]) {
      line = Number(match[3]);
    } else if (
      // See //chromite/lint/linters/whitespace.py
      message === 'delete trailing blank lines' ||
      message === 'file needs a trailing newline'
    ) {
      line = document.lineCount;
    } else {
      line = 1;
    }
    if (sameFile(document.uri.fsPath, file)) {
      diagnostics.push(createDiagnostic(message, 'CrOS lint', line));
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
      diagnostics.push(
        createDiagnostic(message, 'CrOS Go lint', line, startCol)
      );
    }
  }
  return diagnostics;
}

// Creates Diagnostic message.
// line and startCol are both 1-based.
function createDiagnostic(
  message: string,
  source: string,
  line: number,
  startCol?: number
): vscode.Diagnostic {
  const diagnostic = new vscode.Diagnostic(
    new vscode.Range(
      new vscode.Position(line - 1, startCol ? startCol - 1 : 0),
      new vscode.Position(line - 1, Number.MAX_VALUE)
    ),
    message,
    // TODO(b/214322467): Should these actually be errors when they block
    // repo upload?
    vscode.DiagnosticSeverity.Warning
  );
  diagnostic.source = source;
  return diagnostic;
}
