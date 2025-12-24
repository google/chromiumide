// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {getQualifiedPackageName} from '../../../../common/chromiumos/portage/ebuild';
import {PrebuiltImageType, PREBUILT_IMAGE_TYPES} from '../../prebuilt_util';
import {CheckerOutput, CheckerConfig, CheckerInput, CheckResult} from './types';

/*
 * Checks that input image and local environment are compatible.
 * See http://go/cros-seamless-deploy-dd#heading=h.2pn9nrdba2gl for rationale in selecting the
 * current passing conditions.
 */
export class CompatibilityChecker {
  constructor(
    private readonly config: CheckerConfig,
    private readonly input: CheckerInput
  ) {}

  check(): CheckerOutput {
    const results = {
      debugFlag: this.checkUseFlags(),
      version: this.checkCrosVersion(),
    };
    return {
      passed:
        results.debugFlag.status === 'PASSED' &&
        results.version.status === 'PASSED',
      results,
    };
  }

  private result(
    status: CheckResult['status'],
    description: string
  ): CheckResult {
    return {
      status,
      description,
    };
  }

  private checkCrosVersion(): CheckResult {
    if (this.input.device instanceof Error) {
      return this.result(
        'ERROR',
        `failed to get device version: ${this.input.device.message}`
      );
    }
    if (this.input.local.chromeosMajorVersion instanceof Error) {
      return this.result(
        'ERROR',
        `failed to get local CrOS major version: ${this.input.local.chromeosMajorVersion.message}`
      );
    }
    const passed =
      Math.abs(
        this.input.local.chromeosMajorVersion -
          this.input.device.chromeosMajorVersion
      ) <= this.config.versionMaxSkew;
    return this.result(
      passed ? 'PASSED' : 'FAILED',
      `device CrOS major version ${this.input.device.chromeosMajorVersion} ${
        passed ? 'is' : 'not'
      } in range local version ${this.input.local.chromeosMajorVersion} ± ${
        this.config.versionMaxSkew
      } (configurable in extension setting).`
    );
  }

  private debugFlagAndImageTypeMatch(
    localDebugFlag: boolean | undefined,
    imageType: PrebuiltImageType | 'local'
  ): boolean {
    // No need to have consistent cros-debug flag if flag does not exist for package.
    if (localDebugFlag === undefined) {
      return true;
    }
    // Assumes locally built image should be compatible.
    if (imageType === 'local') {
      return true;
    }
    // Release image should have cros-debug flag off.
    if (imageType === 'release' && localDebugFlag) {
      return false;
    }
    // Non-release and non-local image should have cros-debug flag on.
    if (imageType !== 'release' && localDebugFlag === false) {
      return false;
    }
    // All other combinations are valid.
    return true;
  }

  private checkUseFlags(): CheckResult {
    if (this.input.device instanceof Error) {
      return this.result(
        'ERROR',
        `failed to get device image type: ${this.input.device.message}`
      );
    }
    if (
      this.input.device.imageType !== 'local' &&
      !(PREBUILT_IMAGE_TYPES as readonly string[]).includes(
        this.input.device.imageType
      )
    ) {
      return this.result(
        'ERROR',
        `unknown device image type: ${this.input.device.imageType}`
      );
    }
    if (this.input.local.debugFlag instanceof Error) {
      return this.result(
        'ERROR',
        `failed to get USE flag: ${this.input.local.debugFlag.message}`
      );
    }
    return this.result(
      this.debugFlagAndImageTypeMatch(
        this.input.local.debugFlag,
        this.input.device.imageType as PrebuiltImageType | 'local'
      )
        ? 'PASSED'
        : 'FAILED',
      `${getQualifiedPackageName(this.input.targetPackage)} on ${
        this.input.device.board
      } was built ${
        this.input.local.debugFlag === undefined
          ? 'without cros-debug flag'
          : `with cros-debug flag ${this.input.local.debugFlag ? 'on' : 'off'}`
      } and device has a ${this.input.device.imageType} image.`
    );
  }
}
