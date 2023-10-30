// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as util from 'util';
import * as vscode from 'vscode';
import glob from 'glob';
import {getQualifiedPackageName} from '../../../common/chromiumos/portage/ebuild';
import {vscodeRegisterCommand} from '../../../common/vscode/commands';
import * as services from '../../../services';
import * as config from '../../../services/config';
import {StatusManager, TaskStatus} from '../../../ui/bg_task_status';
import {Metrics} from '../../metrics/metrics';
import {Breadcrumbs} from '../boards_and_packages/item';
import {llvmToLineFormat} from './llvm_json_parser';
import {CoverageJson, LlvmFileCoverage} from './types';

// Highlight colors were copied from Code Search.
const coveredDecoration = vscode.window.createTextEditorDecorationType({
  light: {backgroundColor: '#e5ffe5'},
  dark: {backgroundColor: 'rgba(13,101,45,0.5)'},
  isWholeLine: true,
});
const uncoveredDecoration = vscode.window.createTextEditorDecorationType({
  light: {backgroundColor: '#ffe5e5'},
  dark: {backgroundColor: 'rgba(168,19,20,0.5)'},
  isWholeLine: true,
});

const COVERAGE_TASK_ID = 'Code Coverage';

export class Coverage {
  private output: vscode.OutputChannel;

  constructor(
    private readonly chrootService: services.chromiumos.ChrootService,
    private readonly statusManager: StatusManager
  ) {
    this.output = vscode.window.createOutputChannel(
      'ChromiumIDE: Code Coverage'
    );
  }

  activate(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      vscodeRegisterCommand(
        'chromiumide.coverage.generate',
        async (element: Breadcrumbs) => {
          const [board, category, name] = element.breadcrumbs;

          const qpn = getQualifiedPackageName({category, name});

          Metrics.send({
            category: 'interactive',
            group: 'coverage',
            name: 'coverage_generate',
            description: 'generate coverage',
            board,
            package: qpn,
          });

          await this.generateCoverage(board, qpn);
        }
      )
    );

    this.statusManager.setTask(COVERAGE_TASK_ID, {
      status: TaskStatus.OK,
      outputChannel: this.output,
    });

    void this.updateDecorations(vscode.window.activeTextEditor);

    context.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor(editor => {
        void this.updateDecorations(editor);
      })
    );
  }

  private async generateCoverage(board: string, qualifiedPackageName: string) {
    this.statusManager.setStatus(COVERAGE_TASK_ID, TaskStatus.RUNNING);
    const res = await this.chrootService.exec(
      'env',
      [
        'USE=coverage',
        'cros_run_unit_tests',
        `--board=${board}`,
        `--packages=${qualifiedPackageName}`,
      ],
      {
        logger: this.output,
        logStdout: true,
        sudoReason: 'to generate test coverage',
      }
    );
    const statusOk = !(res instanceof Error) && res.exitStatus === 0;
    if (statusOk) {
      void this.updateDecorations(vscode.window.activeTextEditor);
    }
    this.statusManager.setStatus(
      COVERAGE_TASK_ID,
      statusOk ? TaskStatus.OK : TaskStatus.ERROR
    );
  }

  private async updateDecorations(activeEditor?: vscode.TextEditor) {
    if (!activeEditor) {
      return;
    }

    const {covered: coveredRanges, uncovered: uncoveredRanges} =
      await this.readDocumentCoverage(activeEditor.document.fileName);

    let sendMetrics = false;

    if (coveredRanges) {
      activeEditor.setDecorations(coveredDecoration, coveredRanges);
      sendMetrics = true;
    }
    if (uncoveredRanges) {
      activeEditor.setDecorations(uncoveredDecoration, uncoveredRanges);
      sendMetrics = true;
    }

    if (sendMetrics) {
      Metrics.send({
        category: 'background',
        group: 'coverage',
        name: 'coverage_show_background',
        description: 'coverage shown',
        // TODO(b:214322618): send how many lines are marked
      });
    }
  }

  /**
   * Find coverage data for a given file. Returns undefined if coverage is
   * not available, or ranges that should be shown.
   */
  // visible for testing
  async readDocumentCoverage(
    documentFileName: string
  ): Promise<CoverageRanges> {
    const {pkg, relativePath} = parseFileName(documentFileName);
    if (!pkg || !relativePath) {
      return {};
    }

    const coverageJson = await this.readPkgCoverage(pkg);
    if (!coverageJson) {
      return {};
    }

    const llvmCoverage = getLlvmCoverage(coverageJson, relativePath);
    if (!llvmCoverage) {
      return {};
    }

    const converted = llvmToLineFormat(llvmCoverage);

    function toVscodeRange(line: number) {
      return new vscode.Range(line - 1, 0, line - 1, Number.MAX_VALUE);
    }

    return {
      covered: converted.covered.map(line => toVscodeRange(line)),
      uncovered: converted.uncovered.map(line => toVscodeRange(line)),
    };
  }

  private async findCoverageFile(
    pkgName: string,
    fileName: string
  ): Promise<string | undefined> {
    // TODO(ttylenda): find a cleaner way of normalizing the package name.
    const pkgPart = pkgName.indexOf('/') === -1 ? `*/${pkgName}` : pkgName;

    const globPattern = this.chrootService.source.realpath(
      `{chroot,out}/build/${this.getBoard()}/build/coverage_data/${pkgPart}*/*/${fileName}`
    );

    let matches: string[];
    try {
      matches = await util.promisify(glob)(globPattern);
    } catch (e) {
      console.log(e);
      return undefined;
    }

    return matches[0];
  }

  /** Read coverage.json of a package. */
  private async readPkgCoverage(
    pkgName: string
  ): Promise<CoverageJson | undefined> {
    const coverageJson = await this.findCoverageFile(pkgName, 'coverage.json');
    this.output.appendLine('Reading coverage from: ' + coverageJson);
    if (!coverageJson) {
      return undefined;
    }

    try {
      const coverageContents = await fs.promises.readFile(coverageJson, 'utf8');
      return JSON.parse(coverageContents) as CoverageJson;
    } catch (e) {
      console.log(e);
      return undefined;
    }
  }

  private getBoard(): string {
    return config.board.get();
  }
}

/** Ranges where coverage decorations should be applied. */
interface CoverageRanges {
  covered?: vscode.Range[];
  uncovered?: vscode.Range[];
}

const platform2 = 'platform2/';

/** Get package name and relative path from a path to platform2 file. */
function parseFileName(documentFileName: string): {
  pkg?: string;
  relativePath?: string;
} {
  const p2idx = documentFileName.lastIndexOf(platform2);
  if (p2idx === -1) {
    return {};
  }
  // TODO(ttylenda): Get the package without guessing ebuild name and globbing.
  const relativePath = documentFileName.substring(p2idx + platform2.length);
  const pkg = relativePath.split('/')[0];
  return {pkg, relativePath};
}

/** Get LLVM data from a coverage JSON object. */
function getLlvmCoverage(
  coverage: CoverageJson,
  relativePath: string
): LlvmFileCoverage | undefined {
  const files = coverage.data[0].files;
  // TODO(ttylenda): Find the right file in a more accurate way.
  const currentFile = files.find(f => f.filename.endsWith(relativePath));
  return currentFile;
}
