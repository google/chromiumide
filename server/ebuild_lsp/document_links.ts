// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as os from 'os';
import {DocumentLink, DocumentLinkParams, Range} from 'vscode-languageserver';
import {URI} from 'vscode-uri';
import {Context} from './context';
import {findEclassFilePath} from './shared/eclass';
import {EbuildStrValue, ParsedEbuild, parseEbuildOrThrow} from './shared/parse';

const CROS_WORKON_LOCALNAME = 'CROS_WORKON_LOCALNAME';
const CROS_WORKON_SUBTREE = 'CROS_WORKON_SUBTREE';

/**
 * Put links on CROS_WORKON_LOCALNAME and CROS_WORKON_SUBTREE values in ebuilds.
 * They open CodeSearch and new VS Code windows.
 */
export function onDocumentLinks(
  ctx: Context,
  {textDocument}: DocumentLinkParams
): DocumentLink[] | undefined {
  const document = ctx.fs.read(URI.parse(textDocument.uri));
  if (!document) return;

  let parsedEbuild: ParsedEbuild;
  try {
    parsedEbuild = parseEbuildOrThrow(document);
  } catch (e) {
    // Does not provide link for ebuild file failed to be parsed (e.g. edit-
    // in-progress file has open parenthesis or quotes).
    return [];
  }

  const chromiumosRoot = ctx.initializationOptions.chromiumosRoot;

  const links = [];

  for (const parsedEclass of parsedEbuild.inherits) {
    const path = findEclassFilePath(parsedEclass.name, chromiumosRoot);
    if (path !== undefined) {
      links.push(
        ...createLinks(
          ctx,
          parsedEclass.range,
          path.substring(
            path.lastIndexOf(chromiumosRoot) + chromiumosRoot.length + 1 // Trailing directory delimiter after path to CrOS root.
          )
        )
      );
    }
  }

  // Support only one (the last) localname assignment.
  // Cast string-type value to array for unified handling later.
  const localnames = parsedEbuild.getAsStringValues(CROS_WORKON_LOCALNAME);
  if (!localnames) {
    return links;
  }

  // CROS_WORKON_LOCALNAME points to file paths relative to src/ if the
  // package is in the chromeos-base category; otherwise they're relative
  // to src/third_party/.
  // TODO(b:303398643): support third_party (non chromeos-base)
  const pathsFromSrc: string[] = [];
  for (const localname of localnames) {
    // Sometimes we also need to strip leading "../"
    const path = localname.value.startsWith('../')
      ? localname.value.substring(3)
      : localname.value;
    pathsFromSrc.push(path);
    links.push(...createLinks(ctx, localname.range, `src/${path}`));
  }

  // Support only one (the last) subtree assignment.
  // Cast string-type value to array for unified handling later.
  const subtreesPerLocalname =
    parsedEbuild.getAsStringValues(CROS_WORKON_SUBTREE);
  if (!subtreesPerLocalname) {
    return links;
  }

  // Length of subtrees should be the same as number of localname paths.
  // Do not generate link for any of them if it does not match.
  if (subtreesPerLocalname.length !== pathsFromSrc.length) {
    return links;
  }

  for (const [subtrees, pathFromSrc] of subtreesPerLocalname.map<
    [EbuildStrValue, string]
  >((x, i) => [x, pathsFromSrc[i]])) {
    let subtreeMatch: RegExpMatchArray | null;
    const dirNameRe = /[^ ]+/g;
    while ((subtreeMatch = dirNameRe.exec(subtrees.value)) !== null) {
      if (subtreeMatch.index !== undefined) {
        const subtree = subtreeMatch[0];
        const start = {
          line: subtrees.range.start.line,
          character: subtrees.range.start.character + subtreeMatch.index,
        };
        const end = {
          line: start.line,
          character: start.character + subtree.length,
        };
        const range = {start, end};
        links.push(...createLinks(ctx, range, `src/${pathFromSrc}/${subtree}`));
      }
    }
  }

  return links;
}

function createLinks(ctx: Context, range: Range, path: string): DocumentLink[] {
  // TODO(b:303398643): support public CS and other things
  const targetCs = URI.parse(
    `http://source.corp.google.com/h/chromium/chromiumos/codesearch/+/main:${path}`
  );
  const absPath = `${ctx.initializationOptions.chromiumosRoot}/${path}`;
  if (!fs.existsSync(absPath)) {
    return [];
  }

  const csDocumentLink: DocumentLink = {
    range,
    target: targetCs.toString(),
  };
  csDocumentLink.tooltip = `Open ${path} in CodeSearch`;

  const vscodeDocumentLink = generateVsCodeDocumentLink(
    ctx,
    absPath,
    path,
    range
  );
  // Return only link to CS if fails to generate a valid vscode link.
  if (!vscodeDocumentLink) return [csDocumentLink];

  // Ctrl+click opens the first link. If it is a file then we prefer it
  // to go first, otherwise CS goes first.
  return vscodeDocumentLink.target &&
    URI.parse(vscodeDocumentLink.target).scheme === 'file'
    ? [vscodeDocumentLink, csDocumentLink]
    : [csDocumentLink, vscodeDocumentLink];
}

function generateVsCodeDocumentLink(
  ctx: Context,
  absPath: string,
  path: string,
  range: Range
): DocumentLink | undefined {
  let vscodeUri: URI;
  let vscodeTooltip: string;
  if (fs.statSync(absPath).isFile()) {
    // Files have simple Uris that open a new tab.
    vscodeUri = URI.file(absPath);
    vscodeTooltip = `Open ${path} in New Tab`;
  } else {
    const folderUri = getFolderUri(
      absPath,
      ctx.initializationOptions.remoteName
    );
    if (!folderUri) return undefined;

    // Directories require a Uri with a command that opens a new window.
    const args = [
      folderUri,
      {
        forceNewWindow: true,
      },
    ];
    vscodeUri = URI.parse(
      `command:vscode.openFolder?${encodeURIComponent(JSON.stringify(args))}`
    );
    vscodeTooltip = `Open ${path} in New VS Code Window`;
  }

  const vscodeDocumentLink: DocumentLink = {
    range,
    target: vscodeUri.toString(),
  };
  vscodeDocumentLink.tooltip = vscodeTooltip;
  return vscodeDocumentLink;
}

/** Get `Uri` taking into account that we might need to open ssh remote. */
function getFolderUri(
  absPath: string,
  remoteName: string | undefined
): URI | undefined {
  if (remoteName) {
    if (remoteName === 'ssh-remote') {
      return URI.parse(`vscode-remote://ssh-remote+${os.hostname()}${absPath}`);
    }
    // b/311555429: In code-server or code serve-web, file scheme URI is not valid to open a
    // folder in new window.
    return undefined;
  }
  return URI.file(absPath);
}
