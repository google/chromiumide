// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as metrics from '../metrics/metrics';
import * as bgTaskStatus from '../../ui/bg_task_status';
import * as servicesChroot from '../../services/chroot';
import * as commonUtil from '../../common/common_util';
import * as compdbGenerator from './compdb_generator';
import {CLANGD_EXTENSION, SHOW_LOG_COMMAND} from './constants';

export function activate(
  context: vscode.ExtensionContext,
  statusManager: bgTaskStatus.StatusManager,
  chrootService: servicesChroot.ChrootService
) {
  context.subscriptions.push(
    new CppCodeCompletion(
      [output => new compdbGenerator.Platform2(chrootService, output)],
      statusManager
    )
  );
}

const STATUS_BAR_TASK_NAME = 'C++ xrefs generation';

type GeneratorFactory = (
  output: vscode.OutputChannel
) => compdbGenerator.CompdbGenerator;

export class CppCodeCompletion implements vscode.Disposable {
  readonly output = vscode.window.createOutputChannel('CrOS IDE: C++ Support');

  private readonly onDidMaybeGenerateEmitter = new vscode.EventEmitter<void>();
  readonly onDidMaybeGenerate = this.onDidMaybeGenerateEmitter.event;

  private readonly subscriptions: vscode.Disposable[] = [
    this.output,
    vscode.commands.registerCommand(SHOW_LOG_COMMAND.command, () =>
      this.output.show()
    ),
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

  dispose() {
    vscode.Disposable.from(...this.subscriptions).dispose();
  }

  private async maybeGenerate(document: vscode.TextDocument) {
    const generators = [];
    for (const g of this.generators) {
      if (await g.shouldGenerate(document)) {
        generators.push(g);
      }
    }
    if (generators.length === 0) {
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
        status: bgTaskStatus.TaskStatus.RUNNING,
        command: SHOW_LOG_COMMAND,
      });
      const canceller = new vscode.CancellationTokenSource();
      try {
        const action = `${generator.name}: generate compdb`;
        metrics.send({
          category: 'background',
          group: 'cppxrefs',
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
        metrics.send({
          category: 'error',
          group: 'cppxrefs',
          description: error.kind,
        });
        this.output.appendLine(error.message);
        this.showErrorMessage(error);
        this.statusManager.setTask(STATUS_BAR_TASK_NAME, {
          status: bgTaskStatus.TaskStatus.ERROR,
          command: SHOW_LOG_COMMAND,
        });
        return;
      }
      this.statusManager.setTask(STATUS_BAR_TASK_NAME, {
        status: bgTaskStatus.TaskStatus.OK,
        command: SHOW_LOG_COMMAND,
      });
    });
  }

  showErrorMessage(error: compdbGenerator.ErrorDetails) {
    const SHOW_LOG = 'Show Log';
    const IGNORE = 'Ignore';

    const buttons = [];
    for (const {label} of error.buttons) {
      buttons.push(label);
    }
    buttons.concat(SHOW_LOG, IGNORE);

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
