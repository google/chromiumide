// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as metricsUtil from '../../../../driver/metrics/metrics_util';
import * as testing from '../../../testing';

describe('Metrics util: get git repo name', () => {
  const tempDir = testing.tempDir();

  it('path with prefix /home/<username>/chromiumos/', async () => {
    await testing.putFiles(tempDir.path, {
      'src/platform2/.git/HEAD': '',
      'src/platform2/bar/baz.cc': '',
    });

    expect(
      await metricsUtil.getGitRepoName(
        `${tempDir.path}/src/platform2/bar/baz.cc`,
        tempDir.path
      )
    ).toEqual('src/platform2');
  });

  it('path with prefix /mnt/host/source/', async () => {
    await testing.putFiles(tempDir.path, {
      'src/platform2/.git/HEAD': '',
      'src/platform2/bar/baz.cc': '',
    });

    expect(
      await metricsUtil.getGitRepoName(
        `${tempDir.path}/src/platform2/bar/baz.cc`,
        tempDir.path
      )
    ).toEqual('src/platform2');
  });

  it('in chromium repository', async () => {
    const GCLIENT_CONTENT = `solutions = [
  {
    "name": "src",
    "url": "https://chromium.googlesource.com/chromium/src.git",
    "managed": False,
    "custom_deps": {},
    "custom_vars": {},
  },
]
`;

    await testing.putFiles(tempDir.path, {'.gclient': GCLIENT_CONTENT});

    expect(
      await metricsUtil.getGitRepoName(`${tempDir.path}/src/chrome/BUILD.gn`)
    ).toEqual('chromium');
  });

  it('invalid path', async () => {
    // Do not create .git/ directory anywhere.
    await testing.putFiles(tempDir.path, {
      'src/platform2/bar/baz.cc': '',
    });

    expect(
      await metricsUtil.getGitRepoName(
        `${tempDir.path}/src/platform2/bar/baz.cc`,
        tempDir.path
      )
    ).toEqual(undefined);
  });
});

describe('Metrics util: construct GA4 request body from Event', () => {
  it('Simple event', async () => {
    expect(
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
      )
    ).toEqual({
      client_id: 'mock_client_id',
      events: [
        {
          name: 'codesearch_generate_cs_path_failed',
          params: {
            category: 'error',
            description: 'test event',
            engagement_time_msec: '1',
            extension_version: '0.12.0',
            feature_group: 'codesearch',
            git_repo: 'mock git repo',
            os: 'Linux',
            pre_release: 'false',
            vscode_name: 'mock vscode name',
            vscode_version: 'mock vscode version',
          },
        },
      ],
      user_id: 'mock_client_id',
    });
  });
  it('Simple event with pre-release version', async () => {
    expect(
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
      )
    ).toEqual({
      client_id: 'mock_client_id',
      events: [
        {
          name: 'codesearch_generate_cs_path_failed',
          params: {
            category: 'error',
            description: 'test event',
            engagement_time_msec: '1',
            extension_version: '0.1.0',
            feature_group: 'codesearch',
            git_repo: 'mock git repo',
            os: 'Linux',
            pre_release: 'true',
            vscode_name: 'mock vscode name',
            vscode_version: 'mock vscode version',
          },
        },
      ],
      user_id: 'mock_client_id',
    });
  });
  it('Event with label', async () => {
    expect(
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
      )
    ).toEqual({
      client_id: 'mock_client_id',
      events: [
        {
          name: 'virtualdocument_open_document',
          params: {
            category: 'interactive',
            description: 'test event',
            document: 'mock label',
            engagement_time_msec: '1',
            extension_version: '0.12.0',
            feature_group: 'virtualdocument',
            git_repo: 'mock git repo',
            os: 'Linux',
            pre_release: 'false',
            vscode_name: 'mock vscode name',
            vscode_version: 'mock vscode version',
          },
        },
      ],
      user_id: 'mock_client_id',
    });
  });
  it('Event with value', async () => {
    expect(
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
      )
    ).toEqual({
      client_id: 'mock_client_id',
      events: [
        {
          name: 'gerrit_update_comments',
          params: {
            category: 'background',
            description: 'test event',
            displayed_threads_count: 10,
            engagement_time_msec: '1',
            extension_version: '0.12.0',
            feature_group: 'gerrit',
            git_repo: 'mock git repo',
            os: 'Linux',
            pre_release: 'false',
            vscode_name: 'mock vscode name',
            vscode_version: 'mock vscode version',
          },
        },
      ],
      user_id: 'mock_client_id',
    });
  });
});
