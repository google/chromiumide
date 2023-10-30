// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * All the values that can be set as the contextValue of a tree item.
 */
export enum ViewItemContext {
  // Set for board item.
  BOARD = '<board>',
  BOARD_DEFAULT = '<board><default>',
  BOARD_HOST = '<board><host>',
  // Set for category item.
  CATEGORY = '<category>',
  CATEGORY_FAVORITE = '<category><favorite>',
  // Set for package name item.
  PACKAGE = '<package>',
  PACKAGE_STARTED = '<package><started>',
  PACKAGE_STOPPED = '<package><stopped>',
  PACKAGE_FAVORITE = '<package><favorite>',
  PACKAGE_STARTED_FAVORITE = '<package><started><favorite>',
  PACKAGE_STOPPED_FAVORITE = '<package><stopped><favorite>',
}
