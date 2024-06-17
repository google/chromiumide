// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as path from 'path';
import * as util from 'util';
import glob from 'glob';
import Jasmine from 'jasmine';
import {registerDriver} from '../../../shared/app/common/driver_repository';
import {DriverImpl} from '../../driver';

export async function run(): Promise<void> {
  const testsRoot = __dirname;

  registerDriver(new DriverImpl());

  const files = await util.promisify(glob)('**/*.test.js', {cwd: testsRoot});
  const jasmine = new Jasmine();
  files.forEach(f => jasmine.addSpecFile(path.resolve(testsRoot, f)));

  const jasmineDoneInfo = await jasmine.execute();
  if (jasmineDoneInfo.overallStatus === 'passed') {
    return;
  }
  throw new Error(jasmineDoneInfo.overallStatus);
}
