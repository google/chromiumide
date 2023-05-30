// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

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

export type Event = InteractiveEvent | BackgroundEvent | ErrorEvent;
