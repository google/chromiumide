// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as https from 'https';
import * as os from 'os';
import * as queryString from 'querystring';
import * as vscode from 'vscode';
import * as semver from 'semver';
import * as config from '../../services/config';
import * as metricsConfig from './metrics_config';
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
    vscode.commands.registerCommand('cros-ide.resetUserID', async () => {
      await metricsConfig.generateValidUserId();
    })
  );
}

const trackingIdTesting = 'UA-221509619-1';
const trackingIdReal = 'UA-221509619-2';

const optionsGA = {
  hostname: 'www.google-analytics.com',
  path: '/batch',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
};

// Exhaustive list of feature groups.
type FeatureGroup =
  | 'codesearch'
  | 'coverage'
  | 'cppxrefs'
  | 'debugging'
  | 'device'
  | 'format'
  | 'gerrit'
  | 'idestatus'
  | 'lint'
  | 'misc'
  | 'package'
  | 'spellchecker'
  | 'tast'
  // 'virtualdocument' should be used in features that rely on virtual documents,
  // such as Gerrit and spellchecker, when the user interacts with such a document.
  // Event label should be chosen carefully to simplify building a dashboard
  // in Google Analytics
  | 'virtualdocument';

// Fields common to InteractiveEvent and BackgroundEvent.
interface EventBase {
  // Describes the feature group this event belongs to.
  group: FeatureGroup;
  // Describes an operation the extension has just run.
  // You can optional add a prefix with a colon to group actions in the same feature set.
  // Examples:
  //   "select target board"
  //   "device: connect to device via VNC"
  action: string;
  // Label is an optional string that describes the operation.
  label?: string;
  // Value is an optional number that describes the operation.
  value?: number;
}

// Describes an event triggered by an explicit user action, such as VSCode command invocation.
interface InteractiveEvent extends EventBase {
  category: 'interactive';
}

// Describes an event triggered implicitly in the background, such as lint computation.
interface BackgroundEvent extends EventBase {
  category: 'background';
}

// Describes an error event.
interface ErrorEvent {
  category: 'error';
  group: FeatureGroup;
  description: string;
}

type Event = InteractiveEvent | BackgroundEvent | ErrorEvent;

function chooseTrackingId(): string {
  // Use the testing property if the extension was launched for development
  // or running for unit tests.
  if (extensionMode !== vscode.ExtensionMode.Production) {
    return trackingIdTesting;
  }
  // Use the testing property even if the extension was normally installed
  // if the extension version has prerelease suffix (e.g. "-dev.0"), which
  // means that this extension version hasn't been officially released yet.
  if (new semver.SemVer(extensionVersion!).prerelease.length > 0) {
    return trackingIdTesting;
  }
  // Otherwise use the real property.
  return trackingIdReal;
}

export class Analytics {
  private constructor(
    private readonly trackingId: string,
    private readonly userId: string,
    private readonly isGoogler: boolean
  ) {}

  // Constructor cannot be async.
  static async create(): Promise<Analytics> {
    // Send metrics to testing-purpose Google Analytics property to avoid polluting
    // user data when debugging the extension for development.
    const trackingId = chooseTrackingId();
    const userId = await metricsConfig.getOrGenerateValidUserId();
    const isGoogler = await metricsUtils.isGoogler();
    return new Analytics(trackingId, userId, isGoogler);
  }

  /**
   * Creates a batch query from event for Google Analytics measurement protocol, see
   * https://developers.google.com/analytics/devguides/collection/protocol/v1/devguide
   *
   * See go/cros-ide-metrics for the memo on what values are assigned to GA parameters.
   */
  private eventToQuery(event: Event, gitRepo: string | undefined): string {
    const baseData = () => {
      return {
        v: '1',
        tid: this.trackingId,
        cid: this.userId,
        // Document: Git repository info.
        dh: 'cros',
        dp: '/' + (gitRepo ?? 'unknown'),
        dt: gitRepo ?? 'unknown',
        // User agent: OS + VSCode version.
        ua: `${os.type()}-${vscode.env.appName}-${vscode.version}`,
        // Custom dimensions.
        cd1: os.type(),
        cd2: vscode.env.appName,
        cd3: vscode.version,
        cd4: extensionVersion ?? 'unknown',
        cd5: event.group,
      } as Record<string, string | number>;
    };

    const queries: string[] = [];
    if (event.category === 'error') {
      const data = Object.assign(baseData(), {
        t: 'exception',
        exd: `${event.group}: ${event.description}`,
      });
      queries.push(queryString.stringify(data));
    }
    // For an error, we send an event not only an exception. If we only send
    // exception hits we cannot see how many users are impacted per exception
    // description because exception hits are not associated with sessions or
    // users (b/25110142).

    const description =
      event.category === 'error' ? event.description : event.action;

    const data = baseData();
    Object.assign(data, {
      t: 'event',
      ec: event.category,
      ea: `${event.group}: ${description}`,
    });
    if (event.category !== 'error' && event.label !== undefined) {
      data.el = event.label;
    }
    if (event.category !== 'error' && event.value !== undefined) {
      data.ev = event.value;
    }
    queries.push(queryString.stringify(data));

    return queries.join('\n');
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
  void (async () => {
    (await analytics).send(event);
  })();
}
