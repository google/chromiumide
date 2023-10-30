// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';

export type Button = {
  /**
   * The label on the button.
   */
  label: string;

  /**
   * The action to run when the user clicks the button.
   */
  action: () => void;
};

export class ErrorDetails extends Error {
  readonly buttons: Button[];

  /**
   * @param kind A constant string telling the error kind. It's used to avoid
   * reporting the same kind of errors to the user more than once.
   * @param message Error message string.
   * @param buttons Custom buttons to show in the error message.
   */
  constructor(readonly kind: string, message: string, ...buttons: Button[]) {
    super(message);
    this.buttons = buttons;
  }
}

/** The type shouldGenerate method returns. */
export enum ShouldGenerateResult {
  Yes,
  /** The file is not supported by this class */
  NoUnsupported,
  /** Existing compdb should need no change */
  NoNeedNoChange,
  /** The compdb for the file is being generated */
  NoGenerating,
  /** Failure was observed before */
  NoHasFailed,
}

export interface CompdbGenerator extends vscode.Disposable {
  /**
   * Globally unique and constant name of the generator, e.g. "platform2".
   */
  readonly name: string;

  /**
   * Returns whether this class should generate a compilation database for the
   * given document. Returning Yes, `generate` will be called with the same
   * document.
   *
   * This method should not throw an error.
   *
   * This method is called when a document is opened or saved.
   */
  shouldGenerate(document: vscode.TextDocument): Promise<ShouldGenerateResult>;

  /**
   * Generates a compilation database for the given document.
   * It should throw an ErrorDetails when it fails to generate a compilation
   * database.
   *
   * token should be passed to commonUtil.exec when you run a potentially
   * long running operation.
   */
  generate(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): Promise<void>;
}
