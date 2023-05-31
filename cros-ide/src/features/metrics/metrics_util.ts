// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as https from 'https';
import * as os from 'os';
import * as commonUtil from '../../common/common_util';
import * as metricsEvent from './metrics_event';

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

  const gitDir = commonUtil.findGitDir(filePath);
  if (!gitDir) {
    return undefined;
  }

  // Trim prefixes corresponding to path of CrOS checkout.
  const crOSPathRE = new RegExp(`${crosPath}/(.*)`);
  const match = crOSPathRE.exec(gitDir);
  if (match) {
    return match[1];
  }
  return undefined;
}

/**
 * Creates a query from event for Google Analytics 4 measurement protocol, see
 * https://developers.google.com/analytics/devguides/collection/protocol/ga4
 *
 * TODO(b/281925148): update go/cros-ide-metrics document on new GA4 parameters.
 * See go/cros-ide-metrics for the memo on what values are assigned to GA parameters.
 */
export function eventToRequestBodyGA4(
  event: metricsEvent.Event,
  gitRepo: string | undefined,
  clientId: string,
  vscodeName: string,
  vscodeVersion: string,
  extensionVersion: string | undefined,
): string {
  // The unused variables are needed for object destruction of event and match customFields.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const {category, group, name, description, ...customFields} = event;

  // TODO(b/281925148): eventually name should be passed directly as value for event_name.
  // Temporary measure only before all callsites provide name (and Event.name becomes a required
  // field with static check for GA4 rules).
  const sanitizedEventName = metricsEvent.sanitizeEventName(
    name ?? description
  );

  const params = {
    git_repo: gitRepo ?? 'unknown',
    os: os.type(),
    vscode_name: vscodeName,
    vscode_version: vscodeVersion,
    extension_version: extensionVersion ?? 'unknown',
    ...customFields,
  };

  return JSON.stringify({
    client_id: clientId,
    events: [
      {
        name: sanitizedEventName,
        params: params,
      },
    ],
  });
}
