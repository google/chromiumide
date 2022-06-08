// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as https from 'https';
import * as queryString from 'querystring';
import * as vscode from 'vscode';
import * as ideUtil from '../../ide_util';
import * as metricsUtils from './metrics_util';

const informationMessageTitle =
  'CrOS IDE team would like to collect metrics to have a better understanding and improve on ' +
  'your experience!';

const informationMessageDetail =
  'This includes data on install, uninstall, and invocation events of extension features, to ' +
  'obtain insights on how users are using our extension and their satisfaction level.\n' +
  'Working directories of these events will be recorded to help us to identify repositories / ' +
  'projects that the extension is less popular and/or helpful so we can improve on user ' +
  'experience for the teams specifically.\n' +
  'The data is pseudonymous. i.e. it is associated with a randomly generated unique user ID ' +
  'which resets every 180 days automatically, and you can also reset it from the Command ' +
  'Palette.\n' +
  'Raw data is only accessible by the modern IDE team. However, aggregated data (e.g. trend ' +
  'of number of users against time) might be shared with a broader audience for retrospective or ' +
  'advertising purposes.\n' +
  'You can opt-in or out of metrics collection anytime in settings (> extension > CrOS IDE).\n' +
  'Metrics from external (non-googler) users will not be collected.' +
  '\n' +
  'Would you like to assist us by turning on metrics collection for CrOS IDE extension?';

// This variable is set by activate() to make the extension mode available globally.
let extensionMode: vscode.ExtensionMode | undefined = undefined;

export function activate(context: vscode.ExtensionContext) {
  extensionMode = context.extensionMode;

  // Do not show the consent dialog if the extension is running for integration tests.
  // Modal dialogs make tests fail.
  if (context.extensionMode !== vscode.ExtensionMode.Test) {
    const showMessage = ideUtil
      .getConfigRoot()
      .get<boolean>('metrics.showMessage');
    if (showMessage) {
      vscode.window
        .showInformationMessage(
          informationMessageTitle,
          {detail: informationMessageDetail, modal: true},
          'Yes'
        )
        .then(selection => {
          if (selection && selection === 'Yes') {
            ideUtil
              .getConfigRoot()
              .update(
                'metrics.collectMetrics',
                true,
                vscode.ConfigurationTarget.Global
              );
          }
        });
      ideUtil
        .getConfigRoot()
        .update(
          'metrics.showMessage',
          false,
          vscode.ConfigurationTarget.Global
        );
    }
  }

  vscode.commands.registerCommand('cros-ide.resetUserID', () => {
    metricsUtils.resetUserId();
  });
}

const protocolVersion = '1';
const trackingIdTesting = 'UA-221509619-1';
const trackingIdReal = 'UA-221509619-2';
const hitType = 'event';

const optionsGA = {
  hostname: 'www.google-analytics.com',
  path: '/collect',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
};

interface Event {
  category: string;
  action: string;
  label?: string;
  value?: number;
}

export class Analytics {
  private readonly userAgent: string;

  private constructor(
    private readonly trackingId: string,
    private readonly userId: string
  ) {
    this.userAgent = metricsUtils.getUserAgent();
  }

  // Constructor cannot be async.
  static async create(): Promise<Analytics> {
    const uid = await metricsUtils.readOrCreateUserId();
    // Send metrics to testing-purpose Google Analytics property to avoid polluting
    // user data when debugging the extension for development.
    const tid =
      extensionMode === vscode.ExtensionMode.Production
        ? trackingIdReal
        : trackingIdTesting;
    return new Analytics(tid, uid);
  }

  /**
   * Creates query from event for Google Analytics measurement protocol, see
   * https://developers.google.com/analytics/devguides/collection/protocol/v1/devguide
   *
   * Prepend the currently active file path to event label.
   */
  private eventToQuery(event: Event, gitRepo: string | undefined) {
    const data: Record<string, string | number> = {
      v: protocolVersion,
      tid: this.trackingId,
      cid: this.userId,
      t: hitType,
      ec: event.category,
      ea: event.action,
      el: (gitRepo ?? 'NA') + ': ' + (event.label ?? ''),
      ua: this.userAgent,
    };
    if (event.value) {
      data.ev = event.value;
    }

    return queryString.stringify(data);
  }

  /**
   * Decides if we should upload metrics.
   */
  private shouldSend(): boolean {
    return (
      // The extension should have been activated for production or development.
      // Note that we use a different tracking ID in the development mode.
      (extensionMode === vscode.ExtensionMode.Production ||
        extensionMode === vscode.ExtensionMode.Development) &&
      // User ID should be available.
      this.userId !== '' &&
      // User should be a Googler.
      this.userId !== metricsUtils.externalUserIdStub() &&
      // User should have accepted to collect metrics.
      ideUtil.getConfigRoot().get<boolean>('metrics.collectMetrics', false)
    );
  }

  private getCurrentGitRepo(): string | undefined {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      return editor.document.fileName;
    }
    const folders = vscode.workspace.workspaceFolders;
    if (folders && folders.length >= 1) {
      return folders[0].uri.fsPath;
    }
    return undefined;
  }

  /**
   * Send event as query. Does not wait for its response.
   */
  send(event: Event, options = optionsGA) {
    if (!this.shouldSend()) {
      return;
    }

    const filePath = this.getCurrentGitRepo();
    const gitRepo = filePath
      ? metricsUtils.getGitRepoName(filePath)
      : undefined;
    const query = this.eventToQuery(event, gitRepo);
    console.debug(
      `sending query ${query} to GA ${this.trackingId} property with uid ${this.userId}`
    );

    const req = https.request(options, res => {
      console.debug(`Sent request, status code = ${res.statusCode}`);
      const body: Buffer[] = [];
      res.on('data', (chunk: Buffer) => {
        body.push(chunk);
      });
      res.on('end', () => {
        const resString = Buffer.concat(body).toString();
        console.debug(`Sent request, response = ${resString}`);
      });
    });

    req.on('error', error => {
      console.error(error);
    });

    req.write(query);
    req.end();
  }
}

let analytics: Promise<Analytics> | null;
export function send(event: Event) {
  if (!analytics) {
    analytics = Analytics.create();
  }
  analytics.then(a => a.send(event));
}
