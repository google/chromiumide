// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as assert from 'assert';
import * as metricsUtil from '../../../../features/metrics/metrics_util';
import * as testing from '../../../testing';

describe('Metrics util: get git repo name', () => {
  const tempDir = testing.tempDir();

  it('path with prefix /home/<username>/chromiumos/', async () => {
    await testing.putFiles(tempDir.path, {
      'src/platform2/.git/HEAD': '',
      'src/platform2/bar/baz.cc': '',
    });

    assert.strictEqual(
      metricsUtil.getGitRepoName(
        `${tempDir.path}/src/platform2/bar/baz.cc`,
        tempDir.path
      ),
      'src/platform2'
    );
  });

  it('path with prefix /mnt/host/source/', async () => {
    await testing.putFiles(tempDir.path, {
      'src/platform2/.git/HEAD': '',
      'src/platform2/bar/baz.cc': '',
    });

    assert.strictEqual(
      metricsUtil.getGitRepoName(
        `${tempDir.path}/src/platform2/bar/baz.cc`,
        tempDir.path
      ),
      'src/platform2'
    );
  });

  it('invalid path', async () => {
    // Do not create .git/ directory anywhere.
    await testing.putFiles(tempDir.path, {
      'src/platform2/bar/baz.cc': '',
    });

    assert.strictEqual(
      metricsUtil.getGitRepoName(
        `${tempDir.path}/src/platform2/bar/baz.cc`,
        tempDir.path
      ),
      undefined
    );
  });
});

describe('Metrics util: construct GA4 request body from Event', () => {
  it('Simple event', async () => {
    assert.strictEqual(
      metricsUtil.eventToRequestBodyGA4(
        {
          category: 'background',
          group: 'misc',
          name: 'misc_foo_test_event',
          description: 'test event',
        },
        'mock git repo',
        'mock_client_id',
        'mock vscode name',
        'mock vscode version',
        '0.12.0'
      ),
      '{"client_id":"mock_client_id","events":[{"name":"misc_foo_test_event","params":{"git_repo":"mock git repo","os":"Linux","vscode_name":"mock vscode name","vscode_version":"mock vscode version","extension_version":"0.12.0"}}]}'
    );
  });
  it('Event with label', async () => {
    assert.strictEqual(
      metricsUtil.eventToRequestBodyGA4(
        {
          category: 'background',
          group: 'misc',
          name: 'misc_foo_test_event',
          description: 'test event',
          label: 'mock label'
        },
        'mock git repo',
        'mock_client_id',
        'mock vscode name',
        'mock vscode version',
        '0.12.0'
      ),
      '{"client_id":"mock_client_id","events":[{"name":"misc_foo_test_event","params":{"git_repo":"mock git repo","os":"Linux","vscode_name":"mock vscode name","vscode_version":"mock vscode version","extension_version":"0.12.0","label":"mock label"}}]}'
    );
  });
  it('Event with value', async () => {
    assert.strictEqual(
      metricsUtil.eventToRequestBodyGA4(
        {
          category: 'background',
          group: 'misc',
          name: 'misc_foo_test_event',
          description: 'test event',
          value: 10,
        },
        'mock git repo',
        'mock_client_id',
        'mock vscode name',
        'mock vscode version',
        '0.12.0'
      ),
      '{"client_id":"mock_client_id","events":[{"name":"misc_foo_test_event","params":{"git_repo":"mock git repo","os":"Linux","vscode_name":"mock vscode name","vscode_version":"mock vscode version","extension_version":"0.12.0","value":10}}]}'
    );
  });
});
