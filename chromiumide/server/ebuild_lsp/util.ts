// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {Connection} from 'vscode-languageserver';
import {
  Position,
  TextDocument,
  Range,
} from 'vscode-languageserver-textdocument';
import type {MetricsEvent} from './shared/event';

/**
 * Gets a word containing the letter in the position. This is not a reliable method to find a token
 * in ebuild; for example it doesn't recognize a string having a space as one token.
 */
export function getEbuildWordRangeAtPosition(
  document: TextDocument,
  position: Position
): Range | undefined {
  return getWordRangeAtPosition(document, position, /[\w\d]+/);
}

/**
 * Does the equivalent of vscode.TextDocument#getWordRangeAtPosition, except when `wordPattern`
 * is not provided, it always uses the default word pattern, rather than the language specific
 * word pattern configurations VSCode can set (`wordPattern` in [1]).
 *
 * [1] https://code.visualstudio.com/api/references/vscode-api#LanguageConfiguration
 *
 * Takes O(n) time where n is the length of the text.
 */
function getWordRangeAtPosition(
  document: TextDocument,
  position: Position,
  wordPattern = createWordRegExp()
): Range | undefined {
  wordPattern = ensureGlobalRegExp(wordPattern);

  const lines = document.getText().split('\n');
  if (position.line >= lines.length) return undefined;

  for (const match of lines[position.line].matchAll(wordPattern)) {
    // index is always defined for String.matchAll matches.
    // See https://github.com/microsoft/TypeScript/issues/36788
    const start = match.index!;
    const end = start + match[0].length;

    if (end > position.character) {
      if (start <= position.character) {
        return {
          start: {
            line: position.line,
            character: start,
          },
          end: {
            line: position.line,
            character: end,
          },
        };
      } else {
        // We've moved past the position without finding an overlapping word
        break;
      }
    }
  }
  return undefined;
}

function ensureGlobalRegExp(regexp: RegExp): RegExp {
  if (regexp.global) {
    return regexp;
  } else {
    return new RegExp(regexp.source, 'g' + regexp.flags);
  }
}

// The default word separatoers used when no wordPattern is provided in `getWordRangeAtPosition`.
// Copied from https://github.com/microsoft/vscode/blob/acfe0e20cee238c102fa6eaa3c753907652fcf4a/src/vs/editor/common/core/wordHelper.ts#L37
/**
 * Create a word definition regular expression based on default word separators.
 * Optionally provide allowed separators that should be included in words.
 *
 * The default would look like this:
 * /(-?\d*\.\d\w*)|([^\`\~\!\@\#\$\%\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)/g
 */
function createWordRegExp(allowInWords = ''): RegExp {
  let source = '(-?\\d*\\.\\d\\w*)|([^';
  for (const sep of USUAL_WORD_SEPARATORS) {
    if (allowInWords.indexOf(sep) >= 0) {
      continue;
    }
    source += '\\' + sep;
  }
  source += '\\s]+)';
  return new RegExp(source, 'g');
}

const USUAL_WORD_SEPARATORS = '`~!@#$%^&*()-=+[{]}\\|;:\'",.<>/?';

export async function sendMetrics(
  connection: Connection,
  event: MetricsEvent
): Promise<void> {
  await connection.sendNotification('custom/metrics', event);
}
