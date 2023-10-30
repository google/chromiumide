// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as path from 'path';
import {TextDecoder} from 'util';
import * as vscode from 'vscode';
import * as config from '../services/config';

/**
 * Inserts boilerplate (such as the copyright header) into newly created files. Whenever a new file
 * is created, it queries its list of `BoilerplateGenerator`s to find one that supports creating
 * boilerplate for the file. If one is found, then that generator is used to generate the actual
 * boilerplate.
 *
 * Generators are registered using the `addBoilerplateGenerator` method.
 */
export class BoilerplateInserter implements vscode.Disposable {
  private readonly subscriptions = [
    vscode.workspace.onDidCreateFiles(e => {
      for (const f of e.files) {
        void this.handle(f);
      }
    }),
  ];
  dispose(): void {
    vscode.Disposable.from(...this.subscriptions).dispose();
  }

  private shownError = false;

  private readonly boilerplateGenerators = new Set<BoilerplateGenerator>();

  /**
   * Adds an additional `BoilerplateGenerator` to the internal list of generators.
   *
   * @param generator The boilerplate generator to add
   * @returns A disposable to remove the generator from the list
   */
  addBoilerplateGenerator(generator: BoilerplateGenerator): vscode.Disposable {
    this.boilerplateGenerators.add(generator);
    return new vscode.Disposable(() =>
      this.boilerplateGenerators.delete(generator)
    );
  }

  private async handle(uri: vscode.Uri) {
    if (!config.boilerplate.enabled.get()) {
      return;
    }

    const document = await vscode.workspace.openTextDocument(uri);
    for (const generator of this.boilerplateGenerators) {
      if (generator.supportsDocument(document)) {
        await this.insertBoilerplate(document, generator);
        return;
      }
    }
  }

  private async insertBoilerplate(
    document: vscode.TextDocument,
    generator: BoilerplateGenerator
  ) {
    const text = await generator.getBoilerplate(document);
    if (text === null) {
      return;
    }
    const edit = new vscode.WorkspaceEdit();
    edit.insert(document.uri, new vscode.Position(0, 0), text);
    const success = await vscode.workspace.applyEdit(edit);
    if (!success && !this.shownError) {
      this.shownError = true;
      await vscode.window.showErrorMessage(
        `Internal error: failed to add boilerplate for ${document.uri}`
      );
      return;
    }
  }
}

/**
 * Abstract base class for all boilerplate generators. Two methods are of interest to subclasses and
 * should likely be overwritten: `supportsDocument` and `getCopyrightLines`.
 */
export abstract class BoilerplateGenerator {
  /**
   * Returns whether or not this generator supports boilerplate generation for the given document.
   * This method should be overwritten in subclasses to restrict generators to certain directories.
   */
  supportsDocument(document: vscode.TextDocument): boolean {
    // The license header may already exist.
    if (document.lineCount > this.getCopyrightLines().length) {
      return false;
    }

    return this.getLineCommentPrefix(document) !== null;
  }

  /**
   * Must return an array of strings representing the copyright lines to insert at the top of the
   * file. Lines should not include comment symbols ("//" or "#").
   */
  protected abstract getCopyrightLines(): string[];

  async getBoilerplate(document: vscode.TextDocument): Promise<string | null> {
    const copyrightHeader = this.getCopyrightHeader(document);
    if (copyrightHeader === null) {
      return null;
    }
    return `\
${copyrightHeader}

`;
  }

  protected SLASH_COMMENT_LANGUAGES = new Set([
    'c',
    'cpp',
    'go',
    'javascript',
    'rust',
    'typescript',
  ]);

  protected HASH_COMMENT_LANGUAGES = new Set(['gn', 'python', 'shellscript']);

  protected SLASH_COMMENT_EXTENSIONS = new Set([
    'h',
    'cc',
    'nc',
    'go',
    'mm',
    'js',
    'mojom',
    'ts',
    'swift',
  ]);

  protected HASH_COMMENT_EXTENSIONS = new Set(['py', 'gn', 'gni', 'typemap']);

  /**
   * Depending on which VSCode extensions a user has installed, VSCode might not recognize all of
   * the languages in `SLASH_COMMENT_LANGUAGES` and `HASH_COMMENT_LANGUAGES`. Thus, we fall back to
   * file extensions if none of the languages match.
   */
  protected getLineCommentPrefix(document: vscode.TextDocument): string | null {
    const extension = path.extname(document.fileName).slice(1);
    return this.SLASH_COMMENT_LANGUAGES.has(document.languageId)
      ? '//'
      : this.HASH_COMMENT_LANGUAGES.has(document.languageId)
      ? '#'
      : this.SLASH_COMMENT_EXTENSIONS.has(extension)
      ? '//'
      : this.HASH_COMMENT_EXTENSIONS.has(extension)
      ? '#'
      : null;
  }

  protected getCopyrightHeader(document: vscode.TextDocument): string | null {
    const commentPrefix = this.getLineCommentPrefix(document);
    if (commentPrefix === null) {
      return null;
    }
    return this.makeComment(commentPrefix, this.getCopyrightLines());
  }

  protected makeComment(commentPrefix: string, lines: string[]): string | null {
    return lines.map(line => commentPrefix + ' ' + line).join('\n');
  }

  protected isSubPath(root: string, aPath: string): boolean {
    return !path.relative(root, aPath).startsWith('..');
  }
}

/**
 * A boilerplate generator for ChromiumOS projects.
 */
export class ChromiumOSBoilerplateGenerator extends BoilerplateGenerator {
  constructor(private readonly chromiumosRoot: string) {
    super();
  }

  override supportsDocument(document: vscode.TextDocument): boolean {
    return (
      super.supportsDocument(document) &&
      this.isSubPath(this.chromiumosRoot, document.fileName)
    );
  }

  protected override getCopyrightLines(): string[] {
    return [
      `Copyright ${new Date().getFullYear()} The ChromiumOS Authors`,
      'Use of this source code is governed by a BSD-style license that can be',
      'found in the LICENSE file.',
    ];
  }
}

/**
 * A boilerplate generator for Chromium projects.
 */
export class ChromiumBoilerplateGenerator extends BoilerplateGenerator {
  private NO_COMPILE_LINES = [
    'This is a "No Compile Test" suite.',
    'https://dev.chromium.org/developers/testing/no-compile-tests',
  ];

  private TEST_SUFFIXES = ['_test', '_unittest', '_browsertest'];

  constructor(private readonly chromiumSrc: string) {
    super();
  }

  override supportsDocument(document: vscode.TextDocument): boolean {
    return (
      super.supportsDocument(document) &&
      this.isSubPath(this.chromiumSrc, document.fileName)
    );
  }

  protected override getCopyrightLines(): string[] {
    return [
      `Copyright ${new Date().getFullYear()} The Chromium Authors`,
      'Use of this source code is governed by a BSD-style license that can be',
      'found in the LICENSE file.',
    ];
  }

  override async getBoilerplate(
    document: vscode.TextDocument
  ): Promise<string | null> {
    const copyrightHeader = this.getCopyrightHeader(document);
    if (copyrightHeader === null) {
      return null;
    }
    let boilerplate = copyrightHeader + '\n';

    const relativePath = path.relative(this.chromiumSrc, document.fileName);
    const extension = path.extname(relativePath);
    const parentDirectoryUri = vscode.Uri.file(
      path.dirname(document.uri.fsPath)
    );
    if (extension === '.h') {
      const nameSpace = await guessNamespace(parentDirectoryUri);
      boilerplate += this.boilerplateForCppHeader(relativePath, nameSpace);
    } else if (extension === '.cc') {
      const nameSpace = await guessNamespace(parentDirectoryUri);
      boilerplate += this.boilerplateForCppImplementation(
        relativePath,
        nameSpace
      );
    } else if (extension === '.nc') {
      boilerplate += this.boilerplateForNoCompile(relativePath);
    } else if (extension === '.mm') {
      boilerplate += this.boilerplateForObjCppImplementation(relativePath);
    }

    return boilerplate;
  }

  private boilerplateForCppHeader(
    relativePath: string,
    nameSpace: string | null
  ) {
    let guard = relativePath.toUpperCase() + '_';
    guard = guard.replace(/[/\\.+]/g, '_');
    return `
#ifndef ${guard}
#define ${guard}

${
  nameSpace !== null
    ? this.boilerplateForNamespace(relativePath, nameSpace)
    : ''
}

#endif  // ${guard}
`;
  }

  private boilerplateForCppImplementation(
    relativePath: string,
    nameSpace: string | null
  ) {
    const includePath =
      this.normalizeSlashes(this.removeTestSuffix(relativePath)) + '.h';
    return `
#include "${includePath}"

${
  nameSpace !== null
    ? this.boilerplateForNamespace(relativePath, nameSpace) + '\n'
    : ''
}`;
  }

  private boilerplateForNoCompile(relativePath: string) {
    return (
      '\n' +
      this.makeComment('//', this.NO_COMPILE_LINES) +
      '\n' +
      this.boilerplateForCppImplementation(relativePath, null)
    );
  }

  private boilerplateForObjCppImplementation(relativePath: string) {
    const includePath =
      this.normalizeSlashes(this.removeTestSuffix(relativePath)) + '.h';
    return `
#import "${includePath}"

`;
  }

  private boilerplateForNamespace(relativePath: string, nameSpace: string) {
    const isTestFile = this.TEST_SUFFIXES.some(suffix =>
      path.parse(relativePath).name.endsWith(suffix)
    );

    return `\
namespace ${nameSpace} {
${isTestFile ? 'namespace {\n' : ''}\



${isTestFile ? '}  // namespace\n' : ''}\
}  // namespace ${nameSpace}`;
  }

  private removeTestSuffix(relativePath: string) {
    const parts = path.parse(relativePath);
    const base = path.join(parts.dir, parts.name);
    for (const suffix of this.TEST_SUFFIXES) {
      if (base.endsWith(suffix)) {
        return base.slice(0, -suffix.length);
      }
    }
    return base;
  }

  private normalizeSlashes(relativePath: string) {
    return relativePath.replace(/\\/g, '/');
  }
}

/**
 * Reads all .cc and .h files in the given directory and retrieves the most commonly used namespace
 * from them. Will timeout after 500ms in case there are too many files.
 */
async function guessNamespace(directory: vscode.Uri): Promise<string | null> {
  if (!config.boilerplate.guessNamespace.get()) {
    return null;
  }

  const startTime = Date.now();
  const namespaces = new Map<string, number>();
  for (const [name, fileType] of await vscode.workspace.fs.readDirectory(
    directory
  )) {
    // Search for at most 500ms to avoid a long delay in folders with many and large files.
    if (Date.now() - startTime >= 500) {
      break;
    }
    if (fileType !== vscode.FileType.File) {
      continue;
    }
    if (!name.endsWith('.cc') && !name.endsWith('.h')) {
      continue;
    }

    // Read the file and scan it for `namespace ... {`.
    const bytes = await vscode.workspace.fs.readFile(
      vscode.Uri.joinPath(directory, name)
    );
    const text = new TextDecoder().decode(bytes);
    for (const match of text.matchAll(/^namespace (.+) \{$/gm)) {
      const nameSpace = match[1];
      namespaces.set(nameSpace, (namespaces.get(nameSpace) ?? 0) + 1);
    }
  }

  let mostCommonNamespace: string | null = null;
  for (const [nameSpace, count] of namespaces.entries()) {
    if (
      mostCommonNamespace === null ||
      count > namespaces.get(mostCommonNamespace)!
    ) {
      mostCommonNamespace = nameSpace;
    }
  }

  return mostCommonNamespace;
}

export const TEST_ONLY = {
  guessNamespace,
};
