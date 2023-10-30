// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {
  ParsedPackageName,
  getQualifiedPackageName,
} from '../../../../common/chromiumos/portage/ebuild';
import * as config from '../../../../services/config';

export async function addFavoriteCategory(category: string): Promise<void> {
  const favorite = new Set(
    config.boardsAndPackages.favoriteCategories.get() ?? []
  );
  favorite.add(category);
  await config.boardsAndPackages.favoriteCategories.update([...favorite]);
}

export async function deleteFavoriteCategory(category: string): Promise<void> {
  const favorite = new Set(
    config.boardsAndPackages.favoriteCategories.get() ?? []
  );
  favorite.delete(category);
  await config.boardsAndPackages.favoriteCategories.update([...favorite]);
}

export async function addFavoritePackage(
  pkg: ParsedPackageName
): Promise<void> {
  const favorite = new Set(
    config.boardsAndPackages.favoritePackages.get() ?? []
  );
  favorite.add(getQualifiedPackageName(pkg));
  await config.boardsAndPackages.favoritePackages.update([...favorite]);
}

export async function deleteFavoritePackage(
  pkg: ParsedPackageName
): Promise<void> {
  const favorite = new Set(
    config.boardsAndPackages.favoritePackages.get() ?? []
  );
  favorite.delete(getQualifiedPackageName(pkg));
  await config.boardsAndPackages.favoritePackages.update([...favorite]);
}
