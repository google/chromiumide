// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';

export class SimplePickItem implements vscode.QuickPickItem {
  constructor(
    readonly label: string,
    readonly kind?: vscode.QuickPickItemKind,
    readonly description?: string
  ) {}
}

class QuickInputButton implements vscode.QuickInputButton {
  constructor(readonly iconPath: vscode.ThemeIcon, readonly tooltip: string) {}
}

class PrefillButton extends QuickInputButton {
  constructor(label: string) {
    super(
      new vscode.ThemeIcon('arrow-small-right'),
      `prefill input box with ${label}`
    );
  }
}

class QuickPickItemWithButtons implements SimplePickItem {
  constructor(
    readonly label: string,
    readonly buttons: QuickInputButton[],
    readonly kind?: vscode.QuickPickItemKind,
    readonly description?: string
  ) {}
}

/*
 * vscode.QuickPickItem type that has a prefill button.
 * If an item of this type is passed to showInputBoxWithSuggestion, when the button is triggered the
 * input box value will be prefilled with the item label.
 */
export class QuickPickItemWithPrefillButton extends QuickPickItemWithButtons {
  constructor(
    override readonly label: string,
    override readonly kind?: vscode.QuickPickItemKind,
    override readonly description?: string
  ) {
    super(label, [new PrefillButton(label)], kind, description);
  }
}

interface InputBoxWithSuggestionsOptions {
  title?: string;
  placeholder?: string;
  value?: string;
}

/**
 * Shows an input box with suggestions.
 *
 * It is actually a quick pick that shows the user input as the first item.
 * Idea is from:
 * https://github.com/microsoft/vscode/issues/89601#issuecomment-580133277
 */
export function showInputBoxWithSuggestions(
  items: vscode.QuickPickItem[],
  options?: InputBoxWithSuggestionsOptions,
  onDidShowPickerEmitterForTesting?: vscode.EventEmitter<void>
): Promise<string | undefined> {
  const labelSet = new Set(items.map(x => x.label));

  return new Promise(resolve => {
    const subscriptions: vscode.Disposable[] = [];

    const picker = vscode.window.createQuickPick();
    if (options !== undefined) {
      Object.assign(picker, options);
    }
    picker.items = [...items];

    subscriptions.push(
      picker.onDidChangeValue(() => {
        if (!labelSet.has(picker.value)) {
          picker.items = [new SimplePickItem(picker.value), ...items];
        }
      }),
      picker.onDidTriggerItemButton(e => {
        if (e.button instanceof PrefillButton) {
          picker.value = e.item.label;
        }
      }),
      picker.onDidAccept(() => {
        const choice = picker.activeItems[0];
        picker.hide();
        picker.dispose();
        vscode.Disposable.from(...subscriptions).dispose();
        resolve(choice.label);
      })
    );

    picker.show();
    onDidShowPickerEmitterForTesting?.fire();
  });
}
