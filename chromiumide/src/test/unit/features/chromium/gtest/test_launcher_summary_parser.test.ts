// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as testLauncherSummaryParser from '../../../../../features/chromium/gtest/test_launcher_summary_parser';

describe('Gtest summary parser', () => {
  it('parses tests successfully', () => {
    const outputPath = vscode.Uri.file('/src/output/path');
    const result = testLauncherSummaryParser.parseTestLauncherSummary(
      outputPath,
      `\
{
  "all_tests": [
    "All/Suite.Test/DevModeBundle",
    "CmfcmfPTest.FooBar/0"
  ],
  "disabled_tests": [],
  "global_tags": [],
  "per_iteration_data": [
    {
      "All/Suite.Test/DevModeBundle": [
        {
          "elapsed_time_ms": 67,
          "losless_snippet": true,
          "output_snippet": "",
          "output_snippet_base64": "",
          "process_num": 2,
          "result_parts": [],
          "status": "SUCCESS",
          "thread_id": 1558196,
          "timestamp": "2023-06-21T13:34:42.965Z"
        }
      ],
      "CmfcmfPTest.FooBar/0": [
        {
          "elapsed_time_ms": 151,
          "losless_snippet": true,
          "output_snippet": "",
          "output_snippet_base64": "",
          "process_num": 0,
          "result_parts": [
            {
              "file": "../../chrome/browser/web_applications/isolated_web_apps/isolated_web_app_downloader_unittest.cc",
              "line": 91,
              "lossless_message": true,
              "lossless_summary": true,
              "message": "error message",
              "message_base64": "...",
              "summary": "error message summary",
              "summary_base64": "...",
              "type": "failure"
            }
          ],
          "status": "FAILURE",
          "thread_id": 1921233,
          "timestamp": "2023-06-21T14:30:03.248Z"
        }
      ]
    }
  ],
  "test_locations": {
    "All/Suite.Test/DevModeBundle": {
      "file": "../../chrome/browser/web_applications/isolated_web_apps/isolated_web_app_install_command_helper_unittest.cc",
      "line": 313
    },
    "CmfcmfPTest.FooBar/0": {
      "file": "../../chrome/browser/web_applications/isolated_web_apps/isolated_web_app_downloader_unittest.cc",
      "line": 90
    }
  }
}`
    );
    expect(result).toEqual(
      new Map<string, testLauncherSummaryParser.TestSummaryResult>([
        [
          'All/Suite.Test/DevModeBundle',
          {
            status: 'SUCCESS',
            duration: 67,
            errors: [],
          },
        ],
        [
          'CmfcmfPTest.FooBar/0',
          {
            status: 'FAILURE',
            duration: 151,
            errors: [
              (() => {
                const message = new vscode.TestMessage('error message');
                message.location = new vscode.Location(
                  vscode.Uri.file(
                    '/src/chrome/browser/web_applications/isolated_web_apps/isolated_web_app_downloader_unittest.cc'
                  ),
                  new vscode.Range(90, 0, 90, Number.MAX_SAFE_INTEGER)
                );
                return message;
              })(),
            ],
          },
        ],
      ])
    );
  });
});
