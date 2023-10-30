// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as path from 'path';

function packageJsonFilepath(): string {
  return path.join(__dirname, '../../../package.json');
}

type MenuItem = {
  command: string;
  when: string;
  group: string;
};

type MenuItemKey =
  | 'comments/comment/context'
  | 'comments/comment/title'
  | 'comments/commentThread/context'
  | 'comments/commentThread/title'
  | 'view/item/context';

export type PackageJson = {
  contributes: {
    configuration: {
      properties: {
        [key: string]: {
          type: 'string' | 'boolean' | 'array';
          default?: unknown;
        };
      };
    };
    views: {
      'cros-view': {
        id: string;
        name: string;
      }[];
    };
    menus: Record<MenuItemKey, MenuItem[]>;
  };
};

let cachedPackageJsonContent: string | undefined = undefined;

/**
 * Reads and parses the package.json file.
 */
export function readPackageJson(): PackageJson {
  if (!cachedPackageJsonContent) {
    cachedPackageJsonContent = fs.readFileSync(packageJsonFilepath(), {
      encoding: 'utf-8',
    });
  }
  return JSON.parse(cachedPackageJsonContent) as PackageJson;
}
