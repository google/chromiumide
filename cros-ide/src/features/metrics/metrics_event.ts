// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Exhaustive list of categories.
type Category =
  // An event triggered by an explicit user action, such as VSCode command
  // invocation.
  | 'interactive'
  // An event triggered implicitly in the background, such as lint computation.
  | 'background'
  | 'error';

// Exhaustive list of feature groups.
type FeatureGroup =
  | 'chromium.outputDirectories'
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
  | 'owners'
  | 'package'
  | 'spellchecker'
  | 'tast'
  // 'virtualdocument' should be used in features that rely on virtual documents,
  // such as Gerrit and spellchecker, when the user interacts with such a document.
  // Event label should be chosen carefully to simplify building a dashboard
  // in Google Analytics
  | 'virtualdocument';

// Fields common to all events.
interface EventBase {
  // Describes the category this event belongs to.
  category: Category;
  // Describes the feature group this event belongs to.
  group: FeatureGroup;
  // Name of event to be sent to GA4.
  // TODO(b/281925148): name would be a required field with checks to ensure it
  // satisfies GA4 limitations, see
  // https://developers.google.com/analytics/devguides/collection/protocol/ga4/sending-events?client_type=gtag#limitations
  // Unused until switching to GA4.
  name?: string;
  // Describes an operation the extension has just run.
  // You can optional add a prefix with a colon to group actions in the same feature set.
  // Examples:
  //   "select target board"
  //   "device: connect to device via VNC"
  // TODO(b/281925148): description will become a required field. Value is same as the action (for
  // interactive or background events) or description (error events) field sent to UA API.
  description?: string;
  action?: string; // Deprecated. Use description.
  // Label is an optional string that describes the operation.
  label?: string;
  // Value is an optional number that describes the operation.
  value?: number;
}

// TODO(b/281925148): temporary measure before all action fields are renamed to description.
type EventWithDescription = {
  description: string;
};
// TODO(b/281925148): Temporary measure for migrating events to use description instead of action.
// Eventually EventBase would contain `description` as a required field.
type EventWithActionDeprecated = {
  action: string;
};

export type Event = EventBase &
  (EventWithDescription | EventWithActionDeprecated);
