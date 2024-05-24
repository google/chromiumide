// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as commonUtil from '../../../shared/app/common/common_util';
import {getDriver} from '../../../shared/app/common/driver_repository';
import {vscodeRegisterCommand} from '../../../shared/app/common/vscode/commands';
import * as bgTaskStatus from '../../../shared/app/ui/bg_task_status';
import {TaskStatus} from '../../../shared/app/ui/bg_task_status';
import {CLANGD_EXTENSION, SHOW_LOG_COMMAND} from './constants';
import {CompdbGenerator, ErrorDetails, ShouldGenerateResult} from './types';

const driver = getDriver();

const STATUS_BAR_TASK_NAME = 'C++ xrefs generation';

export type GeneratorFactory = (
  output: vscode.OutputChannel
) => CompdbGenerator;

/**
 * Activates C++ xrefs support.
 *
 * It registers handlers for edtior events to provide xrefs only when at least one compdb generator
 * is registered via the `register` command. Just instantiating this class will be no-op.
 */
export class CppXrefs implements vscode.Disposable {
  private readonly subscriptions: vscode.Disposable[] = [];

  private wrappedOutput?: vscode.OutputChannel;
  private get output(): vscode.OutputChannel {
    if (!this.wrappedOutput) {
      this.wrappedOutput = vscode.window.createOutputChannel(
        'ChromiumIDE: C++ Support'
      );
      this.subscriptions.push(this.wrappedOutput);
    }
    return this.wrappedOutput;
  }

  private readonly onDidMaybeGenerateEmitter = new vscode.EventEmitter<void>();
  readonly onDidMaybeGenerate = this.onDidMaybeGenerateEmitter.event;

  private activated = false;
  private activateOnce() {
    if (this.activated) return;
    this.activated = true;

    this.subscriptions.push(
      vscodeRegisterCommand(SHOW_LOG_COMMAND.command, () => {
        this.output.show();
        driver.metrics.send({
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
      })
    );
  }

  private readonly generators: CompdbGenerator[] = [];

  private readonly jobManager = new commonUtil.JobManager<void>();
  // Store errors to avoid showing the same error many times.
  private readonly ignoredErrors = new Set<string>();

  // Indicates clangd extension has been activated (it might have been already
  // activated independently, in which case we will activate it again - not
  // ideal, but not a problem either).
  private clangdActivated = false;

  constructor(private readonly statusManager: bgTaskStatus.StatusManager) {}

  /**
   * Registers compdb generator factories.
   */
  register(...generatorFactories: GeneratorFactory[]): void {
    this.activateOnce();

    for (const f of generatorFactories) {
      const generator = f(this.output);
      this.generators.push(generator);
    }
  }

  dispose(): void {
    vscode.Disposable.from(...this.subscriptions).dispose();
    for (const g of this.generators.splice(0)) {
      g.dispose?.();
    }
  }

  private async maybeGenerate(
    document: vscode.TextDocument,
    runByUser = false
  ) {
    const generators = [];
    for (const g of this.generators) {
      const r = await g.shouldGenerate(document);
      if (
        r === ShouldGenerateResult.Yes ||
        // If the operation is run by user, execute it even when an error was
        // observed before or no change is expected.
        (runByUser &&
          [
            ShouldGenerateResult.NoHasFailed,
            ShouldGenerateResult.NoNeedNoChange,
          ].includes(r))
      ) {
        generators.push(g);
      }
    }
    if (generators.length === 0) {
      if (runByUser) {
        void vscode.window.showErrorMessage(
          `Compilation database generator not found; confirm the active file on editor (${document.fileName}) is a C++ file`
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
    generator: CompdbGenerator,
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
        driver.metrics.send({
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

        const rawError = e as ErrorDetails;
        const errorKind = `${generator.name}: ${rawError.kind}`;
        if (this.ignoredErrors.has(errorKind)) {
          return;
        }
        const error: ErrorDetails = new ErrorDetails(
          errorKind,
          rawError.message,
          ...rawError.buttons
        );
        driver.metrics.send({
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

  private showErrorMessage(error: ErrorDetails): void {
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
