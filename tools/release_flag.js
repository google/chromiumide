// Copyright 2026 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

const fs = require('fs');
const path = require('path');

const packageJsonPath = path.join(__dirname, '..', 'package.json');

const data = fs.readFileSync(packageJsonPath, 'utf8');
const packageJson = JSON.parse(data);
const version = packageJson.version;
const minor = Number(version.split('.')[1]);
if (isNaN(minor)) {
  throw new Error('Failed to parse version in package.json');
}

if (minor % 2 !== 0) {
  console.log('--pre-release');
}
