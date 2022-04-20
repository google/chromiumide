// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as path from 'path';
import * as glob from 'glob';

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

      jasmine.execute().then((jasimineDoneInfo: jasmine.JasmineDoneInfo) => {
        if (jasimineDoneInfo.overallStatus === 'passed') {
          return c();
        }
        return e(new Error(jasimineDoneInfo.overallStatus));
      });
    });
  });
}
