// Copyright 2025 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as path from 'path';
import * as vscode from 'vscode';
import {COMMAND_JNI_ZERO_GO_TO_DEFINITION} from './commands';

// A pattern matching interfaces marked with @NativeMethods.
// This may look terrible, but jni_zero.py also parses Java source code with regex.
// See: https://source.corp.google.com/h/chrome-internal/codesearch/chrome/src/+/main:third_party/jni_zero/parse.py
const INTERFACE_PATTERN =
  /(?<interfaceBodyOffset>@NativeMethods(?:\s*\(\s*"(?<moduleName>[^"]+)"\s*\))?.*?\binterface\s+(?<interfaceName>\w+)\s*{)(?<interfaceBody>.*?)}/gs;

// A pattern matching methods in the body on an interface marked with @NativeMethods.
const METHOD_PATTERN =
  /^(?<indent>\s*)(?<signature>[^/*\n]+\s+(?<methodName>\w+)\(.*?\);)/gms;

export class JniZeroCodeLensProvider implements vscode.CodeLensProvider {
  provideCodeLenses(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): vscode.CodeLens[] {
    const text = document.getText();

    const className = path.basename(document.fileName).split('.')[0];

    const codeLenses: vscode.CodeLens[] = [];
    for (const interfaceMatch of text.matchAll(INTERFACE_PATTERN)) {
      const {interfaceBody, interfaceBodyOffset} = interfaceMatch.groups!;
      for (const methodMatch of interfaceBody.matchAll(METHOD_PATTERN)) {
        const {indent, methodName, signature} = methodMatch.groups!;
        const start =
          interfaceMatch.index! +
          interfaceBodyOffset.length +
          methodMatch.index! +
          indent.length;
        const end = start + signature.length;
        const range = new vscode.Range(
          document.positionAt(start),
          document.positionAt(end)
        );
        const upperMethodName =
          methodName.charAt(0).toUpperCase() + methodName.substring(1);
        codeLenses.push(
          new vscode.CodeLens(range, {
            title: 'Go to JNI implementation',
            command: COMMAND_JNI_ZERO_GO_TO_DEFINITION,
            tooltip: `${className}::${upperMethodName}`,
            arguments: [className, upperMethodName],
          })
        );
      }
    }
    return codeLenses;
  }
}
