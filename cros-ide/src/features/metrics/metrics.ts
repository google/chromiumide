// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as https from 'https';
import * as vscode from 'vscode';
import * as semver from 'semver';
import {vscodeRegisterCommand} from '../../common/vscode/commands';
import * as config from '../../services/config';
import * as metricsConfig from './metrics_config';
import * as metricsEvent from './metrics_event';
import * as metricsUtils from './metrics_util';

const informationMessageTitle =
  'ChromiumIDE team would like to collect metrics to have a better understanding and improve on ' +
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
  'Raw data is only accessible by the ChromiumIDE team. However, aggregated data (e.g. trend ' +
  'of number of users against time) might be shared with a broader audience for retrospective or ' +
  'advertising purposes.\n' +
  'You can opt-in or out of metrics collection anytime in settings (> extension > ChromiumIDE).\n' +
  'Metrics from external (non-googler) users will not be collected.' +
  '\n' +
  'Would you like to assist us by turning on metrics collection for ChromiumIDE extension?';

// This variable is set by activate() to make the extension mode available globally.
let extensionMode: vscode.ExtensionMode | undefined = undefined;
let extensionVersion: string | undefined = undefined;

export async function activate(
  context: vscode.ExtensionContext
): Promise<void> {
  extensionMode = context.extensionMode;
  extensionVersion = context.extension.packageJSON.version;

  // Do not show the consent dialog if the extension is running for integration tests.
  // Modal dialogs make tests fail.
  if (context.extensionMode !== vscode.ExtensionMode.Test) {
    const showMessage = config.metrics.showMessage.get();
    if (showMessage) {
      void (async () => {
        const selection = await vscode.window.showInformationMessage(
          informationMessageTitle,
          {detail: informationMessageDetail, modal: true},
          'Yes'
        );
        if (selection && selection === 'Yes') {
          await config.metrics.collectMetrics.update(true);
        }
      })();
      await config.metrics.showMessage.update(false);
    }
  }

  context.subscriptions.push(
    vscodeRegisterCommand('chromiumide.resetUserID', async () => {
      await metricsConfig.generateValidUserId();
    })
  );
}

enum MetricsMode {
  Testing,
  Real,
}

const apiSecretTesting = 'FxaCE5c2RnKdPWB_t_LnfQ';
const apiSecretReal = 'my_879bLQCq-hgEMGvyBBg';

const measurementIdTesting = 'G-FNW9LF4YWH';
const measurementIdReal = 'G-HZ6QXLP8Y1';

function chooseMode(): MetricsMode {
  // Use the testing property if the extension was launched for development
  // or running for unit tests.
  if (extensionMode !== vscode.ExtensionMode.Production) {
    return MetricsMode.Testing;
  }
  // Use the testing property even if the extension was normally installed
  // if the extension version has prerelease suffix (e.g. "-dev.0"), which
  // means that this extension version hasn't been officially released yet.
  if (new semver.SemVer(extensionVersion!).prerelease.length > 0) {
    return MetricsMode.Testing;
  }
  // Otherwise use the real property.
  return MetricsMode.Real;
}

export class Analytics {
  private readonly options: https.RequestOptions;

  private constructor(
    private readonly mode: MetricsMode,
    private readonly userId: string,
    private readonly isGoogler: boolean
  ) {
    this.options = {
      hostname: 'www.google-analytics.com',
      path: `/mp/collect?api_secret=${
        mode === MetricsMode.Testing ? apiSecretTesting : apiSecretReal
      }&measurement_id=${
        mode === MetricsMode.Testing ? measurementIdTesting : measurementIdReal
      }`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    };
  }

  // Constructor cannot be async.
  static async create(): Promise<Analytics> {
    // Send metrics to testing-purpose Google Analytics property to avoid polluting
    // user data when debugging the extension for development.
    const mode = chooseMode();
    const userId = await metricsConfig.getOrGenerateValidUserId();
    const isGoogler = await metricsUtils.isGoogler();
    return new Analytics(mode, userId, isGoogler);
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
      // Metrics can be collected for Googlers only.
      this.isGoogler &&
      // User should have accepted to collect metrics.
      config.metrics.collectMetrics.get()
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
  send(event: metricsEvent.Event, options = this.options): void {
    if (!this.shouldSend()) {
      return;
    }

    const filePath = this.getCurrentGitRepo();
    const gitRepo = filePath
      ? metricsUtils.getGitRepoName(filePath)
      : undefined;
    const query = metricsUtils.eventToRequestBodyGA4(
      event,
      gitRepo,
      this.userId,
      vscode.env.appName,
      vscode.version,
      extensionVersion
    );
    console.debug(`sending query ${query} to GA4 ${this.options.path}`);

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

/** The class to send metrics. */
export class Metrics {
  static analytics: Promise<Analytics> | null;

  /** Sends event for collecting metrics. */
  static send(event: metricsEvent.Event): void {
    if (!this.analytics) {
      this.analytics = Analytics.create();
    }
    void (async () => {
      (await this.analytics!).send(event);
    })();
  }
}
