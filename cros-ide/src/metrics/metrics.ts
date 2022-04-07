// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as https from 'https';
import * as os from 'os';
import * as queryString from 'querystring';
import * as metricsUtils from './metrics_util';

const protocolVersion = '1';
const trackingIdTesting = 'UA-221509619-1';
const trackingIdReal = 'UA-221509619-2';
const hitType = 'event';

const ideDevelopers =
  ['lokeric', 'hscham', 'oka', 'fqj', 'nya', 'yamaguchi', 'ttylenda', 'yoshiki'];

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

  private constructor(private readonly trackingId: string, private readonly userId: string) {
    this.userAgent = metricsUtils.getUserAgent();
  }

  // Constructor cannot be async.
  static async create() : Promise<Analytics> {
    const uid = await metricsUtils.readOrCreateUserId();
    // Send metrics to testing-purpose Google Analytics property if user is a cros-ide team member,
    // to avoid polluting user data when debugging extension during development.
    const tid = ideDevelopers.includes(os.userInfo().username)?
      trackingIdTesting : trackingIdReal;
    return new Analytics(tid, uid);
  }

  /**
   * Creates query from event for Google Analytics measurement protocol, see
   * https://developers.google.com/analytics/devguides/collection/protocol/v1/devguide
   */
  private eventToQuery(event: Event) {
    const data: any = {
      v: protocolVersion,
      tid: this.trackingId,
      uid: this.userId,
      t: hitType,
      ec: event.category,
      ea: event.action,
      ua: this.userAgent,
    };
    if (event.label) {
      data.el = event.label;
    }
    if (event.value) {
      data.ev = event.value;
    }

    return queryString.stringify(data);
  }

  /**
   * Send event as query. Does not wait for its response.
  */
  send(event: Event, options = optionsGA) {
    // Disable sending metrics at all until privacy review is approved.
    // Do not send event if userId fails to initialize or user is not a googler.
    if (true || !this.userId || this.userId === metricsUtils.externalUserIdStub()) {
      return;
    }

    const query = this.eventToQuery(event);
    console.debug(
        `sending query ${query} to GA ${this.trackingId} property with uid ${this.userId}`);

    const req = https.request(options, res => {
      console.debug(`Sent request, status code = ${res.statusCode}`);
      const body: any[] = [];
      res.on('data', chunk => {
        body.push(chunk);
      });
      res.on(`end`, () => {
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

let analytics: Promise<Analytics>|null;
export function send(event: Event) {
  if (!analytics) {
    analytics = Analytics.create();
  }
  analytics.then(a => a.send(event));
}
