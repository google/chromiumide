// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as metrics from '../../metrics/metrics';
import * as provider from '../device_tree_data_provider';
import * as vnc from '../vnc_session';
import {CommandContext, promptKnownHostnameIfNeeded} from './common';

export async function connectToDeviceForScreen(
  context: CommandContext,
  item?: provider.DeviceItem
): Promise<void> {
  metrics.send({
    category: 'interactive',
    group: 'device',
    action: 'connect to device with VNC',
  });

  const hostname = await promptKnownHostnameIfNeeded(
    'Connect to Device',
    item,
    context.deviceRepository
  );
  if (!hostname) {
    return;
  }

  // If there's an existing session, just reveal its panel.
  const existingSession = context.vncSessions.get(hostname);
  if (existingSession) {
    existingSession.revealPanel();
    return;
  }

  // Create a new session and store it to context.sessions.
  const newSession = await vnc.VncSession.create(
    hostname,
    context.extensionContext,
    context.output
  );
  newSession.onDidDispose(() => {
    context.vncSessions.delete(hostname);
  });
  context.vncSessions.set(hostname, newSession);

  await newSession.start();
}
