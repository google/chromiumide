// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Implements part of Python's configparser [1] for parsing PRESUBMIT.cfg [2].
// [1] https://docs.python.org/3/library/configparser.html
// [2] https://chromium.googlesource.com/chromiumos/repohooks/+/HEAD/README.md#presubmit_cfg

type Config = Record<string, Record<string, string>>;

export class ConfigParser {
  private readonly lines;
  constructor(content: string) {
    // Let last line be always an empty string.
    this.lines = (content.trim() + '\n').split('\n');
  }

  parse(): Config {
    const sectionRe = /\[(.*)\]/;

    const config: Config = {};
    let section = '';
    let keyValues: Config[string] = {};

    for (let i = 0; i < this.lines.length; i++) {
      const line = this.lines[i].trim();

      if (line.startsWith('#') || line.startsWith(';') || line.length === 0) {
        continue;
      }

      const m = sectionRe.exec(line);
      if (m) {
        if (section) {
          config[section] = keyValues;
          keyValues = {};
        }
        section = m[1];
        continue;
      }
      // Read key value pair
      const firstEqual = line.indexOf('=');
      const firstColon = line.indexOf(':');
      const separator =
        firstEqual < 0
          ? firstColon
          : firstColon < 0
          ? firstEqual
          : Math.min(firstEqual, firstColon);
      if (separator < 0) {
        // key without value
        keyValues[line] = '';
        continue;
      }
      const key = line.substring(0, separator).trimEnd();

      const valueLines = [line.substring(separator + 1).trim()];

      let currentDepth = indentDepth(this.lines[i]);
      let nextDepth = indentDepth(this.lines[i + 1]);
      let multiline = nextDepth > currentDepth;
      while (multiline) {
        i++;
        valueLines.push(this.lines[i].trim());
        currentDepth = nextDepth;
        nextDepth = indentDepth(this.lines[i + 1]);
        multiline = nextDepth >= currentDepth;
      }
      keyValues[key] = valueLines.join('\n');
    }
    if (section) {
      config[section] = keyValues;
    }

    return config;
  }
}

function indentDepth(line: string): number {
  return line.length - line.trimStart().length;
}
