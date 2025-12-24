// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode'; // import types only

/**
 * Fake implementation of vscode.QuickPick.
 *
 * For the real implementation see:
 * google3/third_party/vscode/src/vs/workbench/api/common/extHostQuickOpen.ts
 */
export class FakeQuickPick<
  T extends vscode.QuickPickItem = vscode.QuickPickItem
> implements vscode.QuickPick<T>
{
  keepScrollPosition?: boolean | undefined;
  title: string | undefined;
  step: number | undefined;
  totalSteps: number | undefined;
  placeholder: string | undefined = undefined;
  ignoreFocusOut = false;
  enabled = true;
  busy = false;
  canSelectMany = false;
  matchOnDescription = false;
  matchOnDetail = false;
  sortByLabel = false;
  items: T[] = [];

  value = '';
  private readonly onDidChangeValueEmitter = new vscode.EventEmitter<string>();
  readonly onDidChangeValue = this.onDidChangeValueEmitter.event;
  changeValue(value: string): void {
    this.value = value ?? this.value;
    this.onDidChangeValueEmitter.fire(this.value);
  }

  activeItems: T[] = [];
  private readonly onDidChangeActiveEmitter = new vscode.EventEmitter<T[]>();
  readonly onDidChangeActive = this.onDidChangeActiveEmitter.event;
  changeActive(items: T[]): void {
    this.activeItems = items ?? this.activeItems;
    this.onDidChangeActiveEmitter.fire(this.activeItems);
  }

  selectedItems: T[] = [];
  private readonly onDidChangeSelectionEmitter = new vscode.EventEmitter<T[]>();
  readonly onDidChangeSelection = this.onDidChangeSelectionEmitter.event;
  changeSelection(items: T[]): void {
    this.selectedItems = items ?? this.selectedItems;
    this.onDidChangeSelectionEmitter.fire(this.selectedItems);
  }

  private readonly onDidAcceptEmitter = new vscode.EventEmitter<void>();
  readonly onDidAccept = this.onDidAcceptEmitter.event;
  accept(): void {
    this.onDidAcceptEmitter.fire();
  }

  private readonly onDidHideEmitter = new vscode.EventEmitter<void>();
  readonly onDidHide = this.onDidHideEmitter.event;
  hide(): void {
    this.onDidHideEmitter.fire();
  }

  buttons: vscode.QuickInputButton[] = [];
  private readonly onDidTriggerButtonEmitter =
    new vscode.EventEmitter<vscode.QuickInputButton>();
  readonly onDidTriggerButton = this.onDidTriggerButtonEmitter.event;
  triggerButton(button: vscode.QuickInputButton): void {
    this.onDidTriggerButtonEmitter.fire(button);
  }

  private readonly onDidTriggerItemButtonEmitter = new vscode.EventEmitter<
    vscode.QuickPickItemButtonEvent<T>
  >();
  readonly onDidTriggerItemButton = this.onDidTriggerItemButtonEmitter.event;
  triggerItemButton(itemButton: vscode.QuickPickItemButtonEvent<T>): void {
    this.onDidTriggerItemButtonEmitter.fire(itemButton);
  }

  private readonly onDidShowEmitter = new vscode.EventEmitter<void>();
  readonly onDidShow = this.onDidShowEmitter.event;

  show(): void {
    this.onDidShowEmitter.fire();
  }
  dispose(): void {}
}
