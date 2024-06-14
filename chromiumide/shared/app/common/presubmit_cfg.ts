// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {findGitDir} from './common_util';
import {ConfigParser} from './configparser';
import {getDriver} from './driver_repository';
import {LruCache} from './lru_cache';

const driver = getDriver();

const PRESUBMIT_CFG = 'PRESUBMIT.cfg';

enum Section {
  /**
   * This section allows for completely arbitrary hooks to run on a per-repo basis.
   * https://chromium.googlesource.com/chromiumos/repohooks/+/HEAD/README.md#hook-scripts
   */
  HookScripts = 'Hook Scripts',
}

// Maps document filepath to PresubmitCfg instance.
const GLOBAL_CACHE = new LruCache<string, PresubmitCfg | 'undefined'>(10);

/**
 * Accessor for the repository's PRESUBMIT.cfg file.
 */
export class PresubmitCfg {
  private readonly config: Record<string, Record<string, string>>;

  /** The directory that has PRESUBMIT.cfg. */
  readonly root: string;

  private constructor(content: string, root: string) {
    this.root = root;

    const parser = new ConfigParser(content);
    this.config = parser.parse();
  }

  /**
   * Finds the repository the document resides, reads the PRESUBMIT.cfg file in the
   * repository, and returns its accessor as a PresubmitCfg instance.
   *
   * @param crosRoot Absolute path of the CrOS checkout the document belongs to.
   */
  static async forDocument(
    document: vscode.TextDocument,
    crosRoot: string,
    cache: typeof GLOBAL_CACHE | undefined = GLOBAL_CACHE
  ): Promise<PresubmitCfg | undefined> {
    if (crosRoot === '/') {
      // Prevent infinite loop in the following loop.
      throw new Error("Internal error: crosRoot should not be '/'");
    }

    const cached = cache?.get(document.fileName);
    if (cached) {
      return cached === 'undefined' ? undefined : cached;
    }

    const gitRepoRoot = await findGitDir(document.fileName, crosRoot);
    if (gitRepoRoot) {
      const cand = driver.path.join(gitRepoRoot, PRESUBMIT_CFG);
      if (await driver.fs.exists(cand)) {
        const cfg = new PresubmitCfg(
          await driver.fs.readFile(cand),
          gitRepoRoot
        );
        cache?.set(document.fileName, cfg);
        return cfg;
      }
    }

    cache?.set(document.fileName, 'undefined');
    return undefined;
  }

  private keyValues(section: Section): Record<string, string> | undefined {
    return this.config[section];
  }

  /**
   * Returns all the `cros format` commands run as hook script.
   */
  crosFormatRunAsHookScript(): string[] {
    const hooks = this.keyValues(Section.HookScripts);
    if (!hooks) return [];

    // Don't start the regex with `^cros` because some configs specify bin/cros.
    const re = /\bcros\s+format\b/;
    // cros format command is usually keyed by 'cros format', but it's just by convention, so we
    // examine the values as the source of truth here.
    return Object.values(hooks).filter(x => re.test(x));
  }

  /**
   * Returns all the `cros lint` commands run as hook script.
   */
  crosLintRunAsHookScript(): string[] {
    const hooks = this.keyValues(Section.HookScripts);
    if (!hooks) return [];

    // Don't start the regex with `^cros` because some configs specify bin/cros.
    const re = /\bcros\s+lint\b/;
    // cros lint command is usually keyed by 'cros lint', but it's just by convention, so we
    // examine the values as the source of truth here.
    return Object.values(hooks).filter(x => re.test(x));
  }
}
