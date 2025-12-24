// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {AbnormalExitError} from '../../../../../../../shared/app/common/exec/types';
import {
  showSuggestedImagesInputBox,
  TEST_ONLY,
} from '../../../../../../features/device_management/commands/check_image/suggest_image';
import {ChrootService} from '../../../../../../services/chromiumos';
import * as testing from '../../../../../testing';
import {
  installChrootCommandHandler,
  installFakeSudo,
  VoidOutputChannel,
} from '../../../../../testing/fakes';
import {FakeQuickPick} from '../../../../../testing/fakes/quick_pick';
import {HOSTNAME, CONFIG, getTestingInput, BOARD_NAME} from './common';

const {
  showAllMatchingImagesQuickPick,
  LOAD_ALL_VERSIONS_PICK_ITEM,
  RETURN_TO_IMAGE_TYPE_SELECTION,
} = TEST_ONLY;

describe('Suggests images with correct type when cros-debug flag is', () => {
  const tempDir = testing.tempDir();

  const {vscodeSpy} = testing.installVscodeDouble();
  beforeEach(() => {
    // Stop at image type selection step since we only want to check the types listed.
    vscodeSpy.window.showQuickPick
      .withArgs(
        jasmine.anything(),
        jasmine.objectContaining({
          title: 'Select image type',
        })
      )
      .and.returnValue(undefined);
  });

  it('on', () => {
    void showSuggestedImagesInputBox(
      HOSTNAME,
      CONFIG,
      getTestingInput('release', 1, true, 1),
      ChrootService.maybeCreate(tempDir.path, false)!,
      new VoidOutputChannel()
    );
    expect(vscodeSpy.window.showQuickPick).toHaveBeenCalledOnceWith(
      ['postsubmit', 'snapshot', 'local'],
      jasmine.anything()
    );
  });

  it('off', () => {
    void showSuggestedImagesInputBox(
      HOSTNAME,
      CONFIG,
      getTestingInput('release', 1, false, 10),
      ChrootService.maybeCreate(tempDir.path, false)!,
      new VoidOutputChannel()
    );
    expect(vscodeSpy.window.showQuickPick).toHaveBeenCalledOnceWith(
      ['release', 'local'],
      jasmine.anything()
    );
  });

  it('not set', () => {
    void showSuggestedImagesInputBox(
      HOSTNAME,
      CONFIG,
      getTestingInput('release', 1, undefined, 10),
      ChrootService.maybeCreate(tempDir.path, false)!,
      new VoidOutputChannel()
    );
    expect(vscodeSpy.window.showQuickPick).toHaveBeenCalledOnceWith(
      ['postsubmit', 'snapshot', 'release', 'local'],
      jasmine.anything()
    );
  });
});

describe('Create quick pick to choose image within correct version range', () => {
  const {vscodeSpy} = testing.installVscodeDouble();
  const fakeExec = testing.installFakeExec();
  installFakeSudo(fakeExec);
  const tempDir = testing.tempDir();

  const state = testing.cleanState(async () => {
    const onDidChangePickerItems = new vscode.EventEmitter<
      readonly vscode.QuickPickItem[]
    >();
    const state = {
      picker: new FakeQuickPick(),
      onDidChangePickerItems,
      onDidChangePickerItemsReader: new testing.EventReader(
        onDidChangePickerItems.event
      ),
    };

    vscodeSpy.window.createQuickPick.and.returnValue(state.picker);
    return state;
  });

  function handleFetchPrebuiltVersions(version: number, noMatch: boolean) {
    installChrootCommandHandler(
      fakeExec,
      tempDir.path,
      'gsutil',
      [
        'ls',
        `gs://chromeos-image-archive/${BOARD_NAME}-release/*-${version}.*/image.zip`,
      ],
      async args => {
        return noMatch
          ? new AbnormalExitError(
              'gsutil',
              args,
              1,
              '',
              'CommandException: One or more URLs matched no objects'
            )
          : `gs://chromeos-image-archive/${BOARD_NAME}-release/R1-${version}.0.0/image.zip`;
      }
    );
  }

  beforeEach(async () => {
    await testing.buildFakeChromeos(tempDir.path);
  });

  afterEach(() => {
    state.onDidChangePickerItemsReader.dispose();
    state.onDidChangePickerItems.dispose();
  });

  it('first shows current CrOS major version', async () => {
    // Fake `gsutil ls` to fetch one match for release image with current CrOS major version 2.
    handleFetchPrebuiltVersions(2, false);

    const option = showAllMatchingImagesQuickPick(
      'release',
      BOARD_NAME,
      2, // current CrOS major version
      1, // max skew
      HOSTNAME,
      ChrootService.maybeCreate(tempDir.path, false)!,
      new VoidOutputChannel(),
      state.onDidChangePickerItems
    );

    // When the event was fired picker.items should contain only the image matching
    // current CrOS major version (2) and the option to load more.
    await state.onDidChangePickerItemsReader.read().then(items => {
      expect(items.map(i => i.label)).toEqual([
        'R1-2.0.0',
        LOAD_ALL_VERSIONS_PICK_ITEM.label,
      ]);

      state.picker.activeItems = [state.picker.items[0]];
      state.picker.accept();
    });

    expect(await option).toContain('R1-2.0.0');
  });

  it('expands to all images when user requests', async () => {
    // Fake `gsutil ls` to fetch exactly one match for release image with CrOS major version 1 to 3.
    handleFetchPrebuiltVersions(1, false);
    handleFetchPrebuiltVersions(2, false);
    handleFetchPrebuiltVersions(3, false);

    const option = showAllMatchingImagesQuickPick(
      'release',
      BOARD_NAME,
      2, // current CrOS major version
      1, // max skew
      HOSTNAME,
      ChrootService.maybeCreate(tempDir.path, false)!,
      new VoidOutputChannel(),
      state.onDidChangePickerItems
    );

    // Pick the option to load more on the first time the event is fired.
    await state.onDidChangePickerItemsReader.read().then(items => {
      expect(items.map(i => i.label)).toEqual([
        'R1-2.0.0',
        LOAD_ALL_VERSIONS_PICK_ITEM.label,
      ]);

      state.picker.activeItems = [LOAD_ALL_VERSIONS_PICK_ITEM];
      state.picker.accept();
    });

    // The second time picker.items should contain all images within range and sorted from most
    // recent to least. Pick the first one.
    await state.onDidChangePickerItemsReader.read().then(items => {
      expect(items.map(i => i.label)).toEqual([
        'R1-3.0.0',
        'R1-2.0.0',
        'R1-1.0.0',
      ]);
      state.picker.activeItems = [state.picker.items[0]];
      state.picker.accept();
    });

    expect(await option).toContain('R1-3.0.0');
  });

  it('prompt to return to image type selection when there is no match', async () => {
    // Fake `gsutil ls` to return no match for all versions.
    handleFetchPrebuiltVersions(1, true);
    handleFetchPrebuiltVersions(2, true);
    handleFetchPrebuiltVersions(3, true);

    const option = showAllMatchingImagesQuickPick(
      'release',
      BOARD_NAME,
      2, // current CrOS major version
      1, // max skew
      HOSTNAME,
      ChrootService.maybeCreate(tempDir.path, false)!,
      new VoidOutputChannel(),
      state.onDidChangePickerItems
    );

    // Pick the option to load more on the first time the event is fired.
    await state.onDidChangePickerItemsReader.read().then(items => {
      expect(items.map(i => i.label)).toEqual([
        LOAD_ALL_VERSIONS_PICK_ITEM.label,
      ]);

      state.picker.activeItems = [LOAD_ALL_VERSIONS_PICK_ITEM];
      state.picker.accept();
    });

    // The second time picker.items should contain only the 'return to image selection' option.
    await state.onDidChangePickerItemsReader.read().then(items => {
      expect(items.length).toEqual(1);
      expect(items.map(i => i.label)).toContain(
        jasmine.stringContaining(RETURN_TO_IMAGE_TYPE_SELECTION)
      );
      state.picker.activeItems = [state.picker.items[0]];
      state.picker.accept();
    });

    expect(await option).toContain(RETURN_TO_IMAGE_TYPE_SELECTION);
  });
});
