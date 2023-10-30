// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as path from 'path';
import glob = require('glob');
const Jasmine = require('jasmine');

export function run(): Promise<void> {
  const testsRoot = __dirname;

  return new Promise((c, e) => {
    glob('**/**.test.js', {cwd: testsRoot}, (err, files) => {
      if (err) {
        return e(err);
      }

      const jasmine = new Jasmine();

      files.forEach(f => jasmine.addSpecFile(path.resolve(testsRoot, f)));

      jasmine.execute().then((jasmineDoneInfo: jasmine.JasmineDoneInfo) => {
        if (jasmineDoneInfo.overallStatus === 'passed') {
          return c();
        }
        return e(new Error(jasmineDoneInfo.overallStatus));
      });
    });
  });
}
