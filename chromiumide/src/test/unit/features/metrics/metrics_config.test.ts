// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import 'jasmine';
import * as fs from 'fs';
import * as path from 'path';
import * as metricsConfig from '../../../../features/metrics/metrics_config';
import * as testing from '../../../testing';

const UID_REGEXP =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('Metrics config', () => {
  const tempDir = testing.tempDir();

  it('initializes and read user ID', async () => {
    const configPath = path.join(tempDir.path, 'config.json');

    // File containing user ID not found, should create a new one containing testUid.
    const uidCreated = await metricsConfig.getOrGenerateValidUserId(configPath);
    expect(uidCreated).toMatch(UID_REGEXP);

    // Verify it retrieves testUid successfully and not attempting to create a new one.
    const uidRead = await metricsConfig.getOrGenerateValidUserId(configPath);
    expect(uidRead).toEqual(uidCreated);
  });

  it('resets invalid ID', async () => {
    const configPath = path.join(tempDir.path, 'config.json');

    // Create user ID with invalid format, i.e. only a string which stands for ID and not a json.
    await fs.promises.mkdir(path.dirname(configPath), {recursive: true});
    await fs.promises.writeFile(configPath, '{foo: "bar"}');

    // Verify that a new user ID replaces the invalid one.
    const uidRead = await metricsConfig.getOrGenerateValidUserId(configPath);
    expect(uidRead).toMatch(UID_REGEXP);
  });

  it('resets expired ID', async () => {
    const configPath = path.join(tempDir.path, 'config.json');

    const expiredCreateDate = new Date(Date.now() - 181 * 24 * 60 * 60 * 1000);
    // Create user ID with an expired-by-one-day create date.
    const uidCreated = await metricsConfig.generateValidUserId(
      configPath,
      expiredCreateDate
    );
    expect(uidCreated).toMatch(UID_REGEXP);

    // Verify that a new user ID replaces the expired one.
    const uidRead = await metricsConfig.getOrGenerateValidUserId(configPath);
    expect(uidRead).not.toEqual(uidCreated);
  });

  it('resets obsolete @external UID', async () => {
    const configPath = path.join(tempDir.path, 'config.json');

    const data = {
      userid: '@external',
      date: new Date().toISOString(),
    };
    await fs.promises.mkdir(path.dirname(configPath), {recursive: true});
    await fs.promises.writeFile(configPath, JSON.stringify(data));

    // Verify that the UID is regenerated.
    const uidRead = await metricsConfig.getOrGenerateValidUserId(configPath);
    expect(uidRead).toMatch(UID_REGEXP);
  });
});

describe('getUserIdAgeInDays', () => {
  const tempDir = testing.tempDir();
  const now = new Date(2022, 0, 2, 3, 4, 5); // Jan 2, 3:04:05am

  beforeEach(() => {
    jasmine.clock().install();
    jasmine.clock().mockDate(now);
  });

  afterEach(() => {
    jasmine.clock().uninstall();
  });

  it('returns 0 for freshly initialized user ID', async () => {
    const configPath = path.join(tempDir.path, 'config.json');

    // File containing user ID not found, should create a new one.
    await metricsConfig.getOrGenerateValidUserId(configPath);
    // Verify that the user ID is 0 days old.
    const ageRead = await metricsConfig.getUserIdAgeInDays(configPath);
    expect(ageRead).toEqual(0);
  });

  it('returns correct age for user ID with random update time', async () => {
    const configPath = path.join(tempDir.path, 'config.json');
    const age = 30; // days

    const createDate = new Date(now.getTime() - age * 24 * 60 * 60 * 1000);
    // Create user ID with the random create date.
    await metricsConfig.generateValidUserId(configPath, createDate);
    // Verify that the user ID has correct age.
    const ageRead = await metricsConfig.getUserIdAgeInDays(configPath);
    expect(ageRead).toEqual(age);
  });
});
