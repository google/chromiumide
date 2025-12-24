// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {registerDriver} from '../../../../shared/app/common/driver_repository';
import {DriverImpl} from '../../../driver';

registerDriver(new DriverImpl());
