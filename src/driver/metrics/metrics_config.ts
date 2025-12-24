// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as dateFns from 'date-fns';
import * as uuid from 'uuid';

// Number of ms in one day.
const oneDayInMs = 24 * 60 * 60 * 1000;
// Rotate user ID every 180 days or less.
const expirationInMs = 180 * oneDayInMs;

// Special UID indicating the user is an external user and their metrics must not be collected.
// It used to be set in older versions. We need to regenerate a user ID in that case.
const legacySpecialExternalUid = '@external';

// Generates a new user ID.
async function generateNewUserId(): Promise<string> {
  return uuid.v4();
}

const defaultConfigPath = path.join(
  os.homedir(),
  '.config/chromite/cros-ide.google-analytics-uid'
);

// Schema of the config file in JSON.
// Be careful on changing this schema as it might cause metrics to fluctuate.
interface ConfigData {
  // UUIDv4 UID.
  userid: string;
  // Last update time in ISO8601 format.
  date: string;
}

// In-memory representation of the config file.
interface Config {
  // UUIDv4 UID.
  userId: string;
  // Last update time.
  lastUpdate: Date;
}

function isConfigValid(config: Config): boolean {
  // If the user ID is set to @external, regenerate it.
  if (config.userId === legacySpecialExternalUid) {
    return false;
  }
  return Date.now() - config.lastUpdate.getTime() < expirationInMs;
}

async function writeConfigData(
  configPath: string,
  data: ConfigData
): Promise<void> {
  await fs.promises.mkdir(path.dirname(configPath), {recursive: true});
  await fs.promises.writeFile(configPath, JSON.stringify(data));
}

async function readConfigData(configPath: string): Promise<ConfigData> {
  const content = await fs.promises.readFile(configPath, {
    encoding: 'utf8',
    flag: 'r',
  });
  const data = JSON.parse(content);
  if (typeof data !== 'object') {
    console.info('Invalid metrics config file: not an object.');
  }
  if (typeof data.userid === 'string' && typeof data.date === 'string') {
    return data as ConfigData;
  }
  throw new Error('Corrupted metrics config file');
}

async function generateNewConfig(updateTime = new Date()): Promise<Config> {
  return {
    userId: await generateNewUserId(),
    lastUpdate: updateTime,
  };
}

function parseConfigData(data: ConfigData): Config {
  return {
    userId: data.userid,
    lastUpdate: new Date(data.date),
  };
}

async function saveConfig(configPath: string, config: Config): Promise<void> {
  const data: ConfigData = {
    userid: config.userId,
    date: config.lastUpdate.toISOString(),
  };
  await writeConfigData(configPath, data);
}

async function loadConfig(configPath: string): Promise<Config> {
  return parseConfigData(await readConfigData(configPath));
}

/**
 * Unconditionally generates and returns a user ID.
 */
export async function generateValidUserId(
  configPath = defaultConfigPath,
  updateTime = new Date()
): Promise<string> {
  const config = await generateNewConfig(updateTime);
  await saveConfig(configPath, config);
  return config.userId;
}

/**
 * Returns the user ID. Generates a new user ID if it's not been generated yet,
 * or the user ID was generated long ago and needs reset.
 */
export async function getOrGenerateValidUserId(
  configPath = defaultConfigPath,
  updateTime = new Date()
): Promise<string> {
  try {
    const config = await loadConfig(configPath);
    if (isConfigValid(config)) {
      return config.userId;
    }
  } catch {
    // Ignore errors.
  }
  return await generateValidUserId(configPath, updateTime);
}

/**
 * Returns in integer the age of the user ID (floored number of days, i.e. n if
 * it is between n and n+1 days).
 */
export async function getUserIdAgeInDays(
  configPath = defaultConfigPath
): Promise<number> {
  const config = await loadConfig(configPath);
  return dateFns.differenceInDays(Date.now(), config.lastUpdate.getTime());
}
