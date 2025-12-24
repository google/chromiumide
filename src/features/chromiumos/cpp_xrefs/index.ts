// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {CppXrefs, GeneratorFactory} from '../../../common/cpp_xrefs/cpp_xrefs';
import {GenericCompdbGenerator} from '../../../common/cpp_xrefs/generic_compdb_generator';
import {ChrootService} from '../../../services/chromiumos';
import {Kernel, Platform2, PlatformEc} from './compdb_generator';

export class ChromiumosCppXrefs {
  constructor(
    chrootService: ChrootService,
    private readonly cppXrefs: CppXrefs
  ) {
    cppXrefs.register(
      output => new GenericCompdbGenerator(new Kernel(chrootService, output)),
      output =>
        new GenericCompdbGenerator(new Platform2(chrootService, output)),
      output => new PlatformEc(chrootService, output)
    );
  }

  registerExtraGeneratorFactoryForTesting(f: GeneratorFactory): void {
    this.cppXrefs.register(f);
  }

  /**
   * Fired when generator may be triggered. Tests can use this event to wait until a custom
   * `generate` method is called in a loop.
   */
  get onDidMaybeGenerateForTesting(): vscode.Event<void> {
    return this.cppXrefs.onDidMaybeGenerate;
  }
}
