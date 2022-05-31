// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as https from 'https';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import * as uuid from 'uuid';
import * as commonUtil from '../../common/common_util';

// Rotate user ID every 180 days or less.
const expirationInMs = 180 * 24 * 60 * 60 * 1000;

const configPath = path.join(
  os.homedir(),
  '.config/chromite/cros-ide.google-analytics-uid'
);
export function getConfigPath(): string {
  return configPath;
}

export async function isGoogler(): Promise<boolean> {
  let lsbRelease: string;
  try {
    lsbRelease = await fs.promises.readFile('/etc/lsb-release', {
      encoding: 'utf8',
      flag: 'r',
    });
  } catch {
    // If lsb-release cannot be read, fallback to checking whether user is on corp network.
    return new Promise((resolve, _reject) => {
      https
        .get('https://cit-cli-metrics.appspot.com/should-upload', res => {
          resolve(res.statusCode === 200);
        })
        .on('error', _error => {
          resolve(false);
        });
    });
  }

  if (lsbRelease.includes('GOOGLE_ID=Goobuntu')) {
    return true;
  }
  return false;
}

// Never collect metrics from external users.
export function externalUserIdStub(): string {
  return '@external';
}

async function getUserId(): Promise<string> {
  const thisIsGoogler = await isGoogler();
  return thisIsGoogler ? uuid.v4() : externalUserIdStub();
}

// (Over)writes config file with new user ID and create time (number of milliseconds elapsed since
// January 1, 1970, 00:00:00 UTC).
async function writeUserId(configPathFull: string, uid: string, date: Date) {
  console.debug(`writing user id with uid ${uid} and create date ${date}`);
  const data = {
    userid: uid,
    date: date,
  };
  await fs.promises.mkdir(path.dirname(configPathFull), {recursive: true});
  await fs.promises.writeFile(configPathFull, JSON.stringify(data));
}

// Read and return a valid user ID from config file. Return null if any error occurs, including file
// does not exist, invalid config file format, or expired user ID.
async function readUserId(configPathFull: string): Promise<string | null> {
  try {
    const data = await fs.promises.readFile(configPathFull, {
      encoding: 'utf8',
      flag: 'r',
    });
    const json = JSON.parse(data);
    console.log(json);
    if (!json) {
      console.info('Invalid user ID config file: not a JSON.');
      return null;
    }
    if (!json.userid || !json.date) {
      console.info(
        'Invalid user ID config file: does not contain userid or date.'
      );
      return null;
    }
    const createDate = Date.parse(json.date);
    if (Date.now() - createDate >= expirationInMs) {
      console.info(`Current user ID expires: created on ${json.date}.`);
      return null;
    }
    return json.userid;
  } catch (e) {
    return null;
  }
}

// Return an active user ID, possibly by creating a new one if old one has expired or is not found.
// Parameters are for testing purpose only.
export async function readOrCreateUserId(
  rootDir = '/',
  userId: () => Promise<string> = getUserId
): Promise<string> {
  const configPathFull = path.join(rootDir, configPath);
  let uid = await readUserId(configPathFull);
  if (!uid) {
    uid = await resetUserId(rootDir, userId);
  }
  return uid;
}

// Reset (or create new) user ID and return the new one.
// Parameters are for testing purpose only.
export async function resetUserId(
  rootDir = '/',
  userId: () => Promise<string> = getUserId,
  createTime: Date = new Date()
): Promise<string> {
  const configPathFull = path.join(rootDir, configPath);
  const uid = await userId();
  await writeUserId(configPathFull, uid, createTime);
  return uid;
}

export function getUserAgent(): string {
  const type = os.type();
  const platform = os.platform();
  const release = os.release();

  const version = vscode.version;
  const appName = vscode.env.appName;

  return [type, platform, release, version, appName].join('-');
}

// Return path to CrOS checkout.
function getCrOSPath(path: string): string | undefined {
  const chroot = commonUtil.findChroot(path);
  if (!chroot) {
    return undefined;
  }
  return commonUtil.sourceDir(chroot);
}

// Return git repository name by looking for closest .git directory, undefined if none.
export function getGitRepoName(
  filePath: string,
  crosPath: string | undefined = getCrOSPath(filePath)
): string | undefined {
  if (!crosPath) {
    return undefined;
  }

  let gitDir = path.dirname(filePath);
  while (!fs.existsSync(path.join(gitDir, '.git'))) {
    const parent = path.dirname(gitDir);
    if (parent === gitDir) {
      return undefined;
    }
    gitDir = parent;
  }

  // Trim prefixes corresponding to path of CrOS checkout.
  const crOSPathRE = new RegExp(`${crosPath}/(.*)`);
  const match = crOSPathRE.exec(gitDir);
  if (match) {
    return match[1];
  }
  return undefined;
}
