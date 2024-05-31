// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {Hover, HoverParams} from 'vscode-languageserver';
import {URI} from 'vscode-uri';
import {Context} from './context';
import {
  EBUILD_DEFINED_VARIABLES,
  EBUILD_DEFINED_VARIABLES_HOVER_STRING,
  EBUILD_PHASE_FUNCTIONS,
  EBUILD_PHASE_FUNCTIONS_HOVER_STRING,
  PORTAGE_PREDEFINED_READ_ONLY_VARAIBLES,
  PORTAGE_PREDEFINED_READ_ONLY_VARIABLES_HOVER_STRING,
} from './shared/constants';
import {getEbuildWordRangeAtPosition, sendMetrics} from './util';

export function onHover(
  ctx: Context,
  {textDocument, position}: HoverParams
): Hover | undefined {
  const document = ctx.fs.read(URI.parse(textDocument.uri));
  if (!document) return;

  const range = getEbuildWordRangeAtPosition(document, position);

  const word = document.getText(range);

  if (PORTAGE_PREDEFINED_READ_ONLY_VARAIBLES.includes(word)) {
    void sendMetrics(ctx.connection, {
      category: 'background',
      group: 'ebuild',
      name: 'show_portage_predefined_read_only_variable_hover',
      description:
        'ebuild: user hovered on portage predefined read-only variable',
      word: word,
    });
    return {
      contents: PORTAGE_PREDEFINED_READ_ONLY_VARIABLES_HOVER_STRING(word),
      range,
    };
  }
  if (EBUILD_DEFINED_VARIABLES.includes(word)) {
    void sendMetrics(ctx.connection, {
      category: 'background',
      group: 'ebuild',
      name: 'show_ebuild_defined_variable_hover',
      description: 'ebuild: user hovered on ebuild-defined variable',
      word: word,
    });
    return {contents: EBUILD_DEFINED_VARIABLES_HOVER_STRING(word), range};
  }
  if (EBUILD_PHASE_FUNCTIONS.includes(word)) {
    void sendMetrics(ctx.connection, {
      category: 'background',
      group: 'ebuild',
      name: 'show_ebuild_phase_function_hover',
      description: 'ebuild: user hovered on an ebuild phase function',
      word: word,
    });
    return {contents: EBUILD_PHASE_FUNCTIONS_HOVER_STRING(word), range};
  }
}
