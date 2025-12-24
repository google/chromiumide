// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as path from 'path';
import * as vscode from 'vscode';
import * as commonUtil from '../../shared/app/common/common_util';
import {CancelledError} from '../../shared/app/common/exec/types';
import * as bgTaskStatus from '../../shared/app/ui/bg_task_status';
import * as cipd from '../common/cipd';

const STATUS_BAR_TASK_ID = 'DIR_METADATA';

export function activate(
  context: vscode.ExtensionContext,
  statusManager: bgTaskStatus.StatusManager,
  cipdRepository: cipd.CipdRepository
): void {
  const outputChannel = vscode.window.createOutputChannel(
    'ChromiumIDE: DIR_METADATA'
  );
  context.subscriptions.push(outputChannel);

  statusManager.setTask(STATUS_BAR_TASK_ID, {
    status: bgTaskStatus.TaskStatus.OK,
    outputChannel,
  });

  context.subscriptions.push(
    vscode.languages.registerDocumentLinkProvider(
      {scheme: 'file', pattern: '**/DIR_METADATA'},
      new ComponentLinksProvider(outputChannel, statusManager, cipdRepository)
    )
  );
}

class IssueTrackerComponentLink extends vscode.DocumentLink {
  constructor(componentId: number, range: vscode.Range) {
    super(
      range,
      vscode.Uri.parse(
        `https://issuetracker.google.com/status:open componentid:${encodeURIComponent(
          componentId
        )}`
      )
    );
  }

  static readonly PATTERN = /component_id: (?<component>\d+)/g;

  static create(
    range: vscode.Range,
    match: RegExpMatchArray,
    _document: vscode.TextDocument
  ): IssueTrackerComponentLink {
    return new IssueTrackerComponentLink(
      parseInt(match.groups!.component),
      range
    );
  }
}

// Incomplete definition of the following proto:
// https://source.chromium.org/chromium/infra/infra/+/main:go/src/infra/tools/dirmd/proto/mapping.proto
type DirmdMapping = {
  dirs: Record<
    string,
    {
      monorail?: {
        project?: string;
        component?: string;
      };
    }
  >;
  repos: unknown;
};

class MonorailComponentLink extends vscode.DocumentLink {
  constructor(
    private readonly componentName: string,
    private readonly filePath: string,
    range: vscode.Range
  ) {
    super(range);
  }

  static readonly PATTERN = /component: "(?<component>[a-zA-Z0-9_>-]+)"/g;

  static create(
    range: vscode.Range,
    match: RegExpMatchArray,
    document: vscode.TextDocument
  ): MonorailComponentLink {
    return new MonorailComponentLink(
      match.groups!.component,
      document.uri.fsPath,
      range
    );
  }

  async resolve(
    dirmdPath: string,
    outputChannel: vscode.OutputChannel,
    token: vscode.CancellationToken
  ): Promise<void> {
    const res = await commonUtil.exec(
      dirmdPath,
      ['read', '-form', 'sparse', path.dirname(this.filePath)],
      {
        logStdout: true,
        logger: outputChannel,
        cancellationToken: token,
      }
    );
    if (res instanceof CancelledError) {
      return;
    } else if (res instanceof Error) {
      outputChannel.append(`Failed to run 'dirmd' command: ${res}`);
      return;
    }
    const mapping = JSON.parse(res.stdout) as DirmdMapping;
    let monorailProject = Object.values(mapping.dirs)[0].monorail?.project;
    if (!monorailProject) {
      // Not all repos explicitly set `project` for Monorail metadata. All cases we investigated
      // seem to assume 'chromium' as the default project. Therefore, it seems good enough to just
      // default to `chromium` here as well.
      outputChannel.append(
        `Could not determine Monorail project for DIR_METADATA file located in ${this.filePath}. Defaulting to 'chromium'. Please report an issue if this is wrong.`
      );
      monorailProject = 'chromium';
    }

    this.target = vscode.Uri.parse(
      `https://bugs.chromium.org/p/${encodeURIComponent(
        monorailProject
      )}/issues/list?q=component:${encodeURIComponent(this.componentName)}`
    );
  }
}

/**
 * Makes `component: "XYZ"` and `component_id: 123` in DIR_METADATA files clickable.
 */
class ComponentLinksProvider
  implements
    vscode.DocumentLinkProvider<
      MonorailComponentLink | IssueTrackerComponentLink
    >
{
  constructor(
    private readonly outputChannel: vscode.OutputChannel,
    private readonly statusManager: bgTaskStatus.StatusManager,
    private readonly cipdRepository: cipd.CipdRepository
  ) {}

  async provideDocumentLinks(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): Promise<Array<MonorailComponentLink | IssueTrackerComponentLink>> {
    return [
      ...this.extractLinks(
        document,
        IssueTrackerComponentLink.PATTERN,
        IssueTrackerComponentLink.create
      ),
      ...this.extractLinks(
        document,
        MonorailComponentLink.PATTERN,
        MonorailComponentLink.create
      ),
    ];
  }

  async resolveDocumentLink(
    link: MonorailComponentLink | IssueTrackerComponentLink,
    token: vscode.CancellationToken
  ): Promise<MonorailComponentLink | IssueTrackerComponentLink> {
    if (link instanceof IssueTrackerComponentLink) {
      // IssueTracker links do not need to be resolved.
      return link;
    }
    const dirmdPath = await this.dirmdPath();
    if (dirmdPath) {
      await link.resolve(dirmdPath, this.outputChannel, token);
    }
    return link;
  }

  private async dirmdPath() {
    let dirmdPath: string;
    try {
      dirmdPath = await this.cipdRepository.ensureDirmd(this.outputChannel);
    } catch (err) {
      this.outputChannel.append(`Could not download dirmd tool: ${err}`);
      this.statusManager.setStatus(
        STATUS_BAR_TASK_ID,
        bgTaskStatus.TaskStatus.ERROR
      );
      return;
    }
    return dirmdPath;
  }

  private extractLinks(
    document: vscode.TextDocument,
    pattern: RegExp,
    generateLink: (
      range: vscode.Range,
      match: RegExpMatchArray,
      document: vscode.TextDocument
    ) => vscode.DocumentLink
  ) {
    const links: vscode.DocumentLink[] = [];
    const text = document.getText();
    let match: RegExpMatchArray | null;
    while ((match = pattern.exec(text)) !== null) {
      if (match.index !== undefined) {
        const linkStart = document.positionAt(match.index);
        const linkEnd = document.positionAt(match.index + match[0].length);
        const link = generateLink(
          new vscode.Range(linkStart, linkEnd),
          match,
          document
        );
        link.tooltip = 'View bugs';
        links.push(link);
      }
    }
    return links;
  }
}

export const TEST_ONLY = {
  IssueTrackerComponentLink,
  MonorailComponentLink,
  ComponentLinksProvider,
};
