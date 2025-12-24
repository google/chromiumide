// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as services from '../../../services';
import {TestControllerSingleton} from '../../gtest/test_controller_singleton';

/**
 * Dependencies shared by multiple classes used to run platform2 GTests.
 */
export type Config = {
  platform2: string;
  chrootService: services.chromiumos.ChrootService;
  testControllerRepository: TestControllerSingleton;
};
