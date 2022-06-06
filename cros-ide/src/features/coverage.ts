// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as util from 'util';
import * as vscode from 'vscode';
import * as glob from 'glob';
import {ChrootService} from '../services/chroot';
import {Package} from './boards_packages';

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

export class Coverage {
  private activeEditor?: vscode.TextEditor;

  constructor(private readonly chrootService: ChrootService) {}

  activate(_context: vscode.ExtensionContext) {
    // TODO(ttylenda): dispose the commands

    vscode.commands.registerCommand(
      'cros-ide.coverage.generate',
      (pkg: Package) => {
        vscode.window.showInformationMessage(
          `Not implemented (USE=coverage cros_run_unit_tests --board=${pkg.board.name} --packages=${pkg.name}).`
        );
      }
    );

    vscode.commands.registerCommand(
      'cros-ide.coverage.showReport',
      (pkg: Package) => {
        vscode.window.showInformationMessage(
          `TODO: show coverage report for ${pkg.name} (${pkg.board.name})`
        );
      }
    );

    this.activeEditor = vscode.window.activeTextEditor;
    this.updateDecorations();

    vscode.window.onDidChangeActiveTextEditor(editor => {
      this.activeEditor = editor;
      this.updateDecorations();
    });
  }

  private async updateDecorations() {
    if (!this.activeEditor) {
      return;
    }

    const {covered: coveredRanges, uncovered: uncoveredRanges} =
      await this.readDocumentCoverage(this.activeEditor.document.fileName);

    if (coveredRanges) {
      this.activeEditor.setDecorations(coveredDecoration, coveredRanges);
    }
    if (uncoveredRanges) {
      this.activeEditor.setDecorations(uncoveredDecoration, uncoveredRanges);
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

    const segments = await getSegments(coverageJson, relativePath);
    if (!segments) {
      return {};
    }

    // TODO(ttylenda): process segments to display correct output

    const coveredRanges: vscode.Range[] = [];
    const uncoveredRanges: vscode.Range[] = [];

    for (const s of segments) {
      const line = s[LINE_NUMBER];
      const range = new vscode.Range(line, 0, line, Number.MAX_VALUE);
      (s[COUNT] > 0 ? coveredRanges : uncoveredRanges).push(range);
    }

    return {covered: coveredRanges, uncovered: uncoveredRanges};
  }

  /** Read coverage.json of a package. */
  private async readPkgCoverage(
    pkg: string
  ): Promise<CoverageJson | undefined> {
    const chroot = this.chrootService.chroot();
    if (!chroot) {
      return undefined;
    }

    const globPattern = chroot.realpath(
      `${coverageDir}*/${pkg}*/*/coverage.json`
    );

    let matches: string[];
    try {
      matches = await util.promisify(glob)(globPattern);
    } catch (e) {
      console.log(e);
      return undefined;
    }
    const [coverageJson] = matches;
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
}

/** Ranges where coverage decorations should be applied. */
interface CoverageRanges {
  covered?: vscode.Range[];
  uncovered?: vscode.Range[];
}

/**
 * LLVM's coverage format.
 *
 * Fields:
 *   number - the line where this segment begins
 *   column - the column where this segment begins
 *   count - the execution count, or zero if no count was recorded
 *   hasCount - when false, the segment was uninstrumented or skipped
 *   IsRegionEntry - whether this enters a new region or returns
 *                   to a previous count
 */
type Segment = [number, number, number, boolean, boolean, boolean?];

const LINE_NUMBER = 0;
const COUNT = 2;

/** Actual coverage data that we need. */
interface FileCoverage {
  filename: string;
  segments: Segment[];
}

/** Top-level element in coverage.json */
interface CoverageJson {
  // Only data[0] appears to be used.
  data: {files: FileCoverage[]}[];
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

// TODO(ttylenda): Decide if we need a specific board or can we use whatever is available in chroot.
const coverageDir = '/build/amd64-generic/build/coverage_data/';

/** Get segments data from a coverage JSON object. */
async function getSegments(
  coverage: CoverageJson,
  relativePath: string
): Promise<Segment[] | undefined> {
  const files = coverage.data[0].files;
  // TODO(ttylenda): Find the right file in a more accurate way.
  const currentFile = files.find(f => f.filename.endsWith(relativePath));
  return currentFile && currentFile.segments;
}
