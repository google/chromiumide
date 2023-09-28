// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as commonUtil from '../../../common/common_util';
import {vscodeRegisterCommand} from '../../../common/vscode/commands';
import * as services from '../../../services';
import * as bgTaskStatus from '../../../ui/bg_task_status';
import {TaskStatus} from '../../../ui/bg_task_status';
import {Metrics} from '../../metrics/metrics';
import * as compdbGenerator from './compdb_generator';
import {CLANGD_EXTENSION, SHOW_LOG_COMMAND} from './constants';

export function activate(
  subscriptions: vscode.Disposable[],
  statusManager: bgTaskStatus.StatusManager,
  chrootService: services.chromiumos.ChrootService
): void {
  subscriptions.push(
    new CppCodeCompletion(
      [
        output => new compdbGenerator.Platform2(chrootService, output),
        output => new compdbGenerator.PlatformEc(chrootService, output),
      ],
      statusManager
    )
  );
}

const STATUS_BAR_TASK_NAME = 'C++ xrefs generation';

type GeneratorFactory = (
  output: vscode.OutputChannel
) => compdbGenerator.CompdbGenerator;

export class CppCodeCompletion implements vscode.Disposable {
  readonly output = vscode.window.createOutputChannel(
    'ChromiumIDE: C++ Support'
  );

  private readonly onDidMaybeGenerateEmitter = new vscode.EventEmitter<void>();
  readonly onDidMaybeGenerate = this.onDidMaybeGenerateEmitter.event;

  private readonly subscriptions: vscode.Disposable[] = [
    this.output,
    vscodeRegisterCommand(SHOW_LOG_COMMAND.command, () => {
      this.output.show();
      Metrics.send({
        category: 'interactive',
        group: 'idestatus',
        name: 'cppxrefs_show_cpp_log',
        description: 'show cpp log',
      });
    }),
    vscodeRegisterCommand('chromiumide.cppxrefs.forceGenerate', async () => {
      const document = vscode.window.activeTextEditor?.document;

      if (!document) {
        void vscode.window.showErrorMessage(
          'No file is open; open the file to compile and return the command'
        );
        return;
      }
      await this.maybeGenerate(document, true);
      this.onDidMaybeGenerateEmitter.fire();
    }),
    vscode.window.onDidChangeActiveTextEditor(async editor => {
      if (editor?.document) {
        await this.maybeGenerate(editor.document);
        this.onDidMaybeGenerateEmitter.fire();
      }
    }),
    vscode.workspace.onDidSaveTextDocument(async document => {
      await this.maybeGenerate(document);
      this.onDidMaybeGenerateEmitter.fire();
    }),
  ];

  private readonly generators: compdbGenerator.CompdbGenerator[] = [];

  private readonly jobManager = new commonUtil.JobManager<void>();
  // Store errors to avoid showing the same error many times.
  private readonly ignoredErrors = new Set<string>();

  // Indicates clangd extension has been activated (it might have been already
  // activated independently, in which case we will activate it again - not
  // ideal, but not a problem either).
  private clangdActivated = false;

  constructor(
    generatorFactories: GeneratorFactory[],
    private readonly statusManager: bgTaskStatus.StatusManager
  ) {
    for (const f of generatorFactories) {
      const generator = f(this.output);
      this.generators.push(generator);
      this.subscriptions.push(generator);
    }
  }

  dispose(): void {
    vscode.Disposable.from(...this.subscriptions).dispose();
  }

  private async maybeGenerate(
    document: vscode.TextDocument,
    runByUser = false
  ) {
    const generators = [];
    for (const g of this.generators) {
      const r = await g.shouldGenerate(document);
      if (
        r === compdbGenerator.ShouldGenerateResult.Yes ||
        // If the operation is run by user, execute it even when an error was
        // observed before or no change is expected.
        (runByUser &&
          [
            compdbGenerator.ShouldGenerateResult.NoHasFailed,
            compdbGenerator.ShouldGenerateResult.NoNeedNoChange,
          ].includes(r))
      ) {
        generators.push(g);
      }
    }
    if (generators.length === 0) {
      if (runByUser) {
        void vscode.window.showErrorMessage(
          'Compilation database generator not found; confirm the active file on editor is a C++ file'
        );
      }
      return;
    }
    if (generators.length > 1) {
      const name = 'more than one compdb generators';
      if (!this.ignoredErrors.has(name)) {
        void vscode.window.showErrorMessage(
          'Internal error: There are more than one compdb generators for document ' +
            document.fileName
        );
        this.ignoredErrors.add(name);
        // TODO(oka): send metrics.
      }
    }
    if (!(await this.ensureClangdIsActivated())) {
      return;
    }
    for (const g of generators) {
      await this.generate(g, document);
    }
  }

  private async ensureClangdIsActivated() {
    if (this.clangdActivated) {
      return true;
    }

    const clangd = vscode.extensions.getExtension(CLANGD_EXTENSION);
    if (!clangd) {
      return false;
    }

    // Make sure the extension is activated, because we want to call 'clangd.restart'.
    await clangd.activate();
    this.clangdActivated = true;
    return true;
  }

  private async generate(
    generator: compdbGenerator.CompdbGenerator,
    document: vscode.TextDocument
  ) {
    // Below, we create a compilation database.
    // Generating the database is time consuming involving execution of external
    // processes, so we ensure it to run only one at a time using the manager.
    await this.jobManager.offer(async () => {
      this.statusManager.setTask(STATUS_BAR_TASK_NAME, {
        status: TaskStatus.RUNNING,
        command: SHOW_LOG_COMMAND,
        contextValue: 'cppxrefs',
      });
      const canceller = new vscode.CancellationTokenSource();
      try {
        const action = `${generator.name}: generate compdb`;
        Metrics.send({
          category: 'background',
          group: 'cppxrefs',
          name: 'cppxrefs_generate_compdb',
          description: action,
          action,
        });
        // TODO(oka): Make the operation cancellable.
        await generator.generate(document, canceller.token);
        canceller.dispose();
        await vscode.commands.executeCommand('clangd.restart');
      } catch (e) {
        canceller.dispose();

        const rawError = e as compdbGenerator.ErrorDetails;
        const errorKind = `${generator.name}: ${rawError.kind}`;
        if (this.ignoredErrors.has(errorKind)) {
          return;
        }
        const error: compdbGenerator.ErrorDetails =
          new compdbGenerator.ErrorDetails(
            errorKind,
            rawError.message,
            ...rawError.buttons
          );
        Metrics.send({
          category: 'error',
          group: 'cppxrefs',
          name: 'cppxrefs_generate_compdb_error',
          description: error.kind,
          error: error.kind,
        });
        this.output.appendLine(error.message);
        this.showErrorMessage(error);
        this.statusManager.setStatus(STATUS_BAR_TASK_NAME, TaskStatus.ERROR);
        return;
      }
      this.statusManager.setStatus(STATUS_BAR_TASK_NAME, TaskStatus.OK);
    });
  }

  showErrorMessage(error: compdbGenerator.ErrorDetails): void {
    const SHOW_LOG = 'Show Log';
    const IGNORE = 'Ignore';

    const buttons = [];
    for (const {label} of error.buttons) {
      buttons.push(label);
    }
    buttons.push(SHOW_LOG, IGNORE);

    // `await` cannot be used, because it blocks forever if the
    // message is dismissed due to timeout.
    void vscode.window
      .showErrorMessage(error.message, ...buttons)
      .then(value => {
        for (const {label, action} of error.buttons) {
          if (label === value) {
            action();
            return;
          }
        }
        if (value === SHOW_LOG) {
          this.output.show();
        } else if (value === IGNORE) {
          this.ignoredErrors.add(error.kind);
        }
      });
  }
}
