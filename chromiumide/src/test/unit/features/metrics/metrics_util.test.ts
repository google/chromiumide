// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import assert from 'assert';
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
          category: 'error',
          group: 'codesearch',
          name: 'codesearch_generate_cs_path_failed',
          description: 'test event',
        },
        'mock git repo',
        'mock_client_id',
        'mock vscode name',
        'mock vscode version',
        '0.12.0'
      ),
      '{"client_id":"mock_client_id","user_id":"mock_client_id","events":[{"name":"codesearch_generate_cs_path_failed","params":{"engagement_time_msec":"1","git_repo":"mock git repo","os":"Linux","vscode_name":"mock vscode name","vscode_version":"mock vscode version","extension_version":"0.12.0","pre_release":"false","category":"error","feature_group":"codesearch","description":"test event"}}]}'
    );
  });
  it('Simple event with pre-release version', async () => {
    assert.strictEqual(
      metricsUtil.eventToRequestBodyGA4(
        {
          category: 'error',
          group: 'codesearch',
          name: 'codesearch_generate_cs_path_failed',
          description: 'test event',
        },
        'mock git repo',
        'mock_client_id',
        'mock vscode name',
        'mock vscode version',
        '0.1.0'
      ),
      '{"client_id":"mock_client_id","user_id":"mock_client_id","events":[{"name":"codesearch_generate_cs_path_failed","params":{"engagement_time_msec":"1","git_repo":"mock git repo","os":"Linux","vscode_name":"mock vscode name","vscode_version":"mock vscode version","extension_version":"0.1.0","pre_release":"true","category":"error","feature_group":"codesearch","description":"test event"}}]}'
    );
  });
  it('Event with label', async () => {
    assert.strictEqual(
      metricsUtil.eventToRequestBodyGA4(
        {
          category: 'interactive',
          group: 'virtualdocument',
          name: 'virtualdocument_open_document',
          description: 'test event',
          document: 'mock label',
        },
        'mock git repo',
        'mock_client_id',
        'mock vscode name',
        'mock vscode version',
        '0.12.0'
      ),
      '{"client_id":"mock_client_id","user_id":"mock_client_id","events":[{"name":"virtualdocument_open_document","params":{"engagement_time_msec":"1","git_repo":"mock git repo","os":"Linux","vscode_name":"mock vscode name","vscode_version":"mock vscode version","extension_version":"0.12.0","pre_release":"false","category":"interactive","feature_group":"virtualdocument","description":"test event","document":"mock label"}}]}'
    );
  });
  it('Event with value', async () => {
    assert.strictEqual(
      metricsUtil.eventToRequestBodyGA4(
        {
          category: 'background',
          group: 'gerrit',
          name: 'gerrit_update_comments',
          description: 'test event',
          displayed_threads_count: 10,
        },
        'mock git repo',
        'mock_client_id',
        'mock vscode name',
        'mock vscode version',
        '0.12.0'
      ),
      '{"client_id":"mock_client_id","user_id":"mock_client_id","events":[{"name":"gerrit_update_comments","params":{"engagement_time_msec":"1","git_repo":"mock git repo","os":"Linux","vscode_name":"mock vscode name","vscode_version":"mock vscode version","extension_version":"0.12.0","pre_release":"false","category":"background","feature_group":"gerrit","description":"test event","displayed_threads_count":10}}]}'
    );
  });
});
