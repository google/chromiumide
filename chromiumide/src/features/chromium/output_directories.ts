// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import assert from 'assert';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import {vscodeRegisterCommand} from '../../common/vscode/commands';
import {Metrics} from '../../features/metrics/metrics';
import * as bgTaskStatus from '../../ui/bg_task_status';
import * as gnArgs from './gn_args';
import type {Stats} from 'fs';

export const CURRENT_LINK_NAME = `out${path.sep}current_link`;
const STATUS_BAR_TASK_ID = 'Chromium Output Directories';

/**
 * Creates or updates a symlink at `linkPath` to point to `targetPath`. Returns `true` on success,
 * and `false` on failure. Unfortunately, `vscode.workspace.fs` does not have APIs to create and
 * delete symlinks, thus this function uses Node.js' `fs`.
 */
export async function createOrUpdateSymLinkToDirectory(
  targetPath: string,
  linkPath: string
): Promise<boolean> {
  let stat: Stats | null = null;
  try {
    stat = await fs.lstat(linkPath);
  } catch (err) {
    // Symlink does not exist.
  }
  if (stat) {
    if (stat.isSymbolicLink()) {
      await fs.unlink(linkPath);
    } else {
      Metrics.send({
        category: 'error',
        group: 'chromium.outputDirectories',
        description: 'unable to update symlink: is not a symlink',
        name: 'chromium_outputDirectories_not_a_symlink',
      });
      return false;
    }
  }
  await fs.symlink(targetPath, linkPath, 'dir');
  return true;
}

export function activate(
  context: vscode.ExtensionContext,
  statusManager: bgTaskStatus.StatusManager,
  rootPath: string
): void {
  const srcPath = path.join(rootPath, 'src');

  const outputChannel = vscode.window.createOutputChannel(
    'ChromiumIDE: Chromium Output Directories'
  );
  statusManager.setTask(STATUS_BAR_TASK_ID, {
    status: bgTaskStatus.TaskStatus.OK,
    outputChannel,
  });

  const treeDataProvider = new OutputDirectoriesDataProvider(
    context,
    outputChannel,
    srcPath
  );
  const treeView = vscode.window.createTreeView(
    'chromiumide.chromium.outputDirectories',
    {treeDataProvider, showCollapseAll: false}
  );
  context.subscriptions.push(treeView);

  // TODO(cmfcmf): File watching does not work for some reason, probably because the recommended
  // VSCode configuration for Chromium includes the `out*/**` directories in `files.watcherExclude`
  // and in `files.exclude`.
  //
  // const watcher = vscode.workspace.createFileSystemWatcher(
  //   new vscode.RelativePattern(srcPath, 'out*/*'),
  //   false,
  //   false,
  //   false
  // );
  // context.subscriptions.push(
  //   watcher.onDidChange(() => {
  //     void treeDataProvider.refresh();
  //   }),
  //   watcher.onDidDelete(() => {
  //     void treeDataProvider.refresh();
  //   }),
  //   watcher.onDidCreate(() => {
  //     void treeDataProvider.refresh();
  //   })
  // );
  // context.subscriptions.push(watcher);

  context.subscriptions.push(
    vscodeRegisterCommand(
      'chromiumide.chromium.outputDirectories.editArgs',
      async (node?: unknown) => {
        if (node instanceof DirNode || node instanceof LinkNode) {
          await vscode.commands.executeCommand(
            'vscode.open',
            vscode.Uri.file(path.join(srcPath, node.name, 'args.gn'))
          );

          Metrics.send({
            category: 'interactive',
            group: 'chromium.outputDirectories',
            description: 'edit args.gn',
            name: 'chromium_outputDirectories_edit_args_gn',
          });
        }
      }
    )
  );

  context.subscriptions.push(
    vscodeRegisterCommand(
      'chromiumide.chromium.outputDirectories.refresh',
      async () => {
        await treeDataProvider.refresh();

        Metrics.send({
          category: 'interactive',
          group: 'chromium.outputDirectories',
          description: 'refresh',
          name: 'chromium_outputDirectories_refresh',
        });
      }
    )
  );

  context.subscriptions.push(
    vscodeRegisterCommand(
      'chromiumide.chromium.outputDirectories.setCurrentLink',
      async (node?: unknown) => {
        if (!(node instanceof DirNode)) {
          return;
        }

        const newOutDirName = node.name;
        // Do some basic sanity checking on the output directory name, just in case.
        if (
          !newOutDirName.match(/^(out|out_[a-zA-Z0-9_-]+)[/\\][a-zA-Z0-9_-]+$/)
        ) {
          Metrics.send({
            category: 'error',
            group: 'chromium.outputDirectories',
            description:
              'change output directory: invalid output directory name',
            name: 'chromium_outputDirectories_invalid_directory_name',
          });

          return vscode.window.showErrorMessage(
            `Invalid character(s) in output directory name: "${newOutDirName}" (must start with out/ or out_XXX/).`
          );
        }

        // Create the `out` directory which will contain the symlink if it does not yet exist.
        await vscode.workspace.fs.createDirectory(
          vscode.Uri.file(path.join(srcPath, path.dirname(CURRENT_LINK_NAME)))
        );
        if (
          !(await createOrUpdateSymLinkToDirectory(
            path.join(srcPath, newOutDirName),
            path.join(srcPath, CURRENT_LINK_NAME)
          ))
        ) {
          return vscode.window.showErrorMessage('Unable to update symlink.');
        }
        await Promise.all([
          vscode.window.showInformationMessage(
            `${newOutDirName} set as output directory.`
          ),
          treeDataProvider.refresh(),
        ]);

        Metrics.send({
          category: 'interactive',
          group: 'chromium.outputDirectories',
          description: 'change output directory',
          name: 'chromium_outputDirectories_change_output_directory',
        });
      }
    )
  );

  context.subscriptions.push(
    vscodeRegisterCommand(
      'chromiumide.chromium.outputDirectories.viewArgsGnError',
      async (node?: unknown) => {
        if (node instanceof DirNode && node.gnArgsInfo.type === 'error') {
          await vscode.window.showTextDocument(
            await vscode.workspace.openTextDocument({
              content: node.gnArgsInfo.error.toString(),
            })
          );

          Metrics.send({
            category: 'interactive',
            group: 'chromium.outputDirectories',
            description: 'view args.gn error',
            name: 'chromium_outputDirectories_view_args_gn_error',
          });
        }
      }
    )
  );

  context.subscriptions.push(
    vscodeRegisterCommand(
      'chromiumide.chromium.outputDirectories.viewArgsGnWarnings',
      async (node?: unknown) => {
        if (
          node instanceof DirNode &&
          node.gnArgsInfo.type === 'success' &&
          node.gnArgsInfo.warnings.length > 0
        ) {
          await vscode.window.showTextDocument(
            await vscode.workspace.openTextDocument({
              content: `${
                node.gnArgsInfo.warnings.length
              } warning(s) found:\n\n${node.gnArgsInfo.warnings
                .map(
                  (warning, idx) => `######## Warning ${idx + 1}: ${warning}`
                )
                .join('\n\n')}`,
            })
          );

          Metrics.send({
            category: 'interactive',
            group: 'chromium.outputDirectories',
            description: 'view args.gn warnings',
            name: 'chromium_outputDirectories_view_args_gn_warnings',
          });
        }
      }
    )
  );
}

// Represents the base of a node in the output directory view.
abstract class BaseNode {
  // Used as the context value for this node, which can be used in `when` clauses of menus.
  abstract readonly treeNodeContextValue: string;

  // The name of the output directory must always consist of two parts, like `out/Default`, or
  // `out_hatch/Debug`.
  constructor(readonly name: string) {
    assert(name.split(path.sep).length === 2);
  }

  // Converts this node into a `vscode.TreeItem` to be used in the tree view.
  abstract asTreeItem(): vscode.TreeItem;
}

// A `DirNode` represents an output directory.
export class DirNode extends BaseNode {
  get treeNodeContextValue(): string {
    return `type:directory,gnArgsStatus:${this.gnArgsInfo.type}${
      this.gnArgsInfo.type === 'success' && this.gnArgsInfo.warnings.length > 0
        ? ',gnArgsHasWarnings'
        : ''
    }`;
  }

  /**
   * @param name The name of the directory, e.g., `out/Default`
   * @param isCurrent Whether or not `CURRENT_LINK_NAME` currently points to this directory.
   * @param gnArgsInfo Information about the GN args of this directory.
   */
  constructor(
    name: string,
    public isCurrent: boolean,
    public gnArgsInfo: gnArgs.GnArgsInfo
  ) {
    super(name);
  }

  override asTreeItem(): vscode.TreeItem {
    let tooltip: vscode.MarkdownString | undefined = undefined;
    let description: string | undefined = undefined;

    let label = this.name;
    if (this.isCurrent) {
      label = '>> ' + this.name;
      tooltip = new vscode.MarkdownString('current output directory');
    }

    let icon = new vscode.ThemeIcon(
      'file-directory',
      this.isCurrent ? new vscode.ThemeColor('charts.green') : undefined
    );

    switch (this.gnArgsInfo.type) {
      case 'unknown':
        description = 'loading gn.args...';
        break;
      case 'error':
        icon = new vscode.ThemeIcon(
          'warning',
          new vscode.ThemeColor('list.errorForeground')
        );
        description = 'Failed to load gn.args (right click for details)';
        break;
      case 'success':
        if (this.gnArgsInfo.warnings.length > 0) {
          icon = new vscode.ThemeIcon(
            'warning',
            new vscode.ThemeColor('list.warningForeground')
          );
          description = `${this.gnArgsInfo.warnings.length} warning(s) found (right click for details)`;
        }
        break;
    }

    return {
      id: this.name,
      label,
      description,
      tooltip,
      collapsibleState: vscode.TreeItemCollapsibleState.None,
      contextValue: this.treeNodeContextValue,
      iconPath: icon,
      command: {
        command: 'chromiumide.chromium.outputDirectories.setCurrentLink',
        title: 'Set as output directory',
        arguments: [this],
      },
    };
  }

  async readGnArgs(
    srcPath: string,
    token: vscode.CancellationToken
  ): Promise<void> {
    this.gnArgsInfo = await gnArgs.readGnArgs(srcPath, this.name, token);
  }
}

// A `LinkNode` represents a link to an output directory.
export class LinkNode extends BaseNode {
  readonly treeNodeContextValue = 'type:link';

  /**
   * @param name The name of the link, e.g., `out/current_link`.
   * @param targetOutName The name of the output directory the link points to (e.g.,
   * `out_hatch/Default`), or `null`, if the link does not point to a valid output directory.
   */
  constructor(name: string, readonly targetOutName: string | null) {
    super(name);
  }

  override asTreeItem(): vscode.TreeItem {
    let description: string | undefined = undefined;
    if (this.targetOutName !== null) {
      description = this.targetOutName;
    }
    let tooltip: string | undefined = undefined;
    if (this.name === CURRENT_LINK_NAME) {
      tooltip =
        'This link points to the output directory that is currently in use.';
    }

    return {
      id: this.name,
      label: this.name,
      description,
      tooltip,
      collapsibleState: vscode.TreeItemCollapsibleState.None,
      contextValue: this.treeNodeContextValue,
      iconPath: new vscode.ThemeIcon('file-symlink-directory'),
    };
  }
}

type Node = DirNode | LinkNode;

type NodeCache = {
  nodes: Node[];
  // tokenSource is used to create tokens that are used to cancel ongoing operations when the cache
  // is cleared.
  tokenSource: vscode.CancellationTokenSource;
  // Mainly useful for testing. Resolves once gn.args of all of these nodes have been read.
  gnArgsPromise: Promise<void[]>;
};

export class OutputDirectoriesDataProvider
  implements vscode.TreeDataProvider<Node>
{
  private nodeCache: NodeCache | null = null;

  private _onDidChangeTreeData = new vscode.EventEmitter<Node | void>();
  onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(
    private readonly context: Pick<vscode.ExtensionContext, 'subscriptions'>,
    private readonly outputChannel: vscode.OutputChannel,
    private readonly srcPath: string
  ) {}

  getNodeCacheForTesting(): Readonly<NodeCache | null> {
    return this.nodeCache;
  }

  /**
   * Cancel all ongoing operations that are based on the outdated cache, then clear the cache and
   * refresh the tree view.
   */
  refresh(): void {
    this.nodeCache?.tokenSource.cancel();
    this.nodeCache = null;
    this._onDidChangeTreeData.fire();
  }

  getChildren = async (node?: Node): Promise<Node[]> => {
    if (node) {
      // None of the nodes have children, since this view only displays a flat list of output
      // directories.
      return [];
    }

    // Rebuild the node cache if it does not yet exist.
    if (this.nodeCache === null) {
      const newNodeCache = await this.buildNodeCache();
      if (this.nodeCache !== null) {
        // This should never happen, because VSCode does not call `getChildren` concurrently. Log an
        // error just in case.
        this.outputChannel.appendLine(
          'Error: Node cache was rebuilt concurrently.'
        );
        Metrics.send({
          category: 'error',
          group: 'chromium.outputDirectories',
          description: 'race condition while rebuilding node cache',
          name: 'chromium_outputDirectories_race_condition_at_rebuild',
        });
      }
      this.nodeCache = newNodeCache;
    }

    return this.nodeCache.nodes;
  };

  getTreeItem = (node: Node): vscode.TreeItem => {
    return node.asTreeItem();
  };

  getParent = (_node: Node): Node | undefined => {
    // Since this is just a flat list of nodes, none of the nodes have parents.
    return undefined;
  };

  private async buildNodeCache(): Promise<NodeCache> {
    this.outputChannel.appendLine('Rebuilding node cache...');

    const tokenSource = new vscode.CancellationTokenSource();
    this.context.subscriptions.push(tokenSource);

    const topLevelOutDirNames = await this.findTopLevelOutDirNames();
    this.outputChannel.appendLine(
      'Found the following top-level output directories:'
    );
    this.outputChannel.appendLine(
      topLevelOutDirNames.map(each => `- ${each}`).join('\n')
    );

    const nodes: Node[] = [];
    await Promise.all(
      topLevelOutDirNames.map(async topLevelOutDirName => {
        nodes.push(
          ...(await this.findSubDirectoriesInTopLevelOutDir(topLevelOutDirName))
        );
      })
    );

    // Sort by whether or not a node is a link first, then sort alphabetically.
    nodes.sort((a, b) => {
      if (a instanceof LinkNode && !(b instanceof LinkNode)) {
        return -1;
      }
      if (!(a instanceof LinkNode) && b instanceof LinkNode) {
        return 1;
      }
      return a.name.localeCompare(b.name);
    });

    this.outputChannel.appendLine('Found the following output directories:');
    this.outputChannel.appendLine(
      nodes
        .map(each => `- ${each.name} (${each.treeNodeContextValue})`)
        .join('\n')
    );

    // Now, read the GN args for each output directory. We do not wait for it to finish.
    const gnArgsPromise = Promise.all(
      nodes.map(async node => {
        if (node instanceof DirNode) {
          await node.readGnArgs(this.srcPath, tokenSource.token);
          if (tokenSource.token.isCancellationRequested) {
            return;
          }
          this.outputChannel.appendLine(
            `Read GN args of ${node.name}: ${JSON.stringify(node.gnArgsInfo)}`
          );
          this._onDidChangeTreeData.fire(node);
        }
      })
    );
    // Check if any of the link nodes are the special `CURRENT_LINK_NAME` node. If so, update
    // `isCurrent` of the directory node it points to.
    const currentLinkNode = nodes.find(
      (node): node is LinkNode =>
        node instanceof LinkNode && node.name === CURRENT_LINK_NAME
    );
    if (currentLinkNode) {
      const currentTarget = nodes.find(
        node => node.name === currentLinkNode.targetOutName
      );
      if (currentTarget instanceof DirNode) {
        currentTarget.isCurrent = true;
      }
    }

    Metrics.send({
      category: 'background',
      group: 'chromium.outputDirectories',
      description: 'number of output directories',
      name: 'chromium_outputDirectories_built_node_cache',
      output_directories_count: nodes.length,
    });

    return {nodes, tokenSource, gnArgsPromise};
  }

  /**
   * Finds all top-level directories in the Chromium checkout that are called
   * `out` or `out_*`.
   */
  private async findTopLevelOutDirNames(): Promise<string[]> {
    const entries = await vscode.workspace.fs.readDirectory(
      vscode.Uri.file(this.srcPath)
    );

    return entries.flatMap(([name, fileType]) => {
      if (fileType !== vscode.FileType.Directory) {
        return [];
      }
      if (name === 'out' || name.startsWith('out_')) {
        return name;
      }
      return [];
    });
  }

  /**
   * Finds all subdirectories and symlinks inside a top-level output directory, and converts them
   * into `Node`s.
   */
  private async findSubDirectoriesInTopLevelOutDir(
    topLevelOutDirName: string
  ): Promise<Node[]> {
    const entries = await vscode.workspace.fs.readDirectory(
      vscode.Uri.file(path.join(this.srcPath, topLevelOutDirName))
    );

    const nodes: Node[] = [];
    try {
      await Promise.all(
        entries.map(async ([name, fileType]) => {
          // Contains the name of this output folder, relative to Chromium's src directory. Examples:
          // `out/Default`, `out_hatch/Debug`, ...
          const outName = path.join(topLevelOutDirName, name);
          if (fileType === vscode.FileType.Directory) {
            nodes.push(
              new DirNode(
                outName,
                /*isCurrent=*/ false,
                /*gnArgsInfo=*/ {type: 'unknown'}
              )
            );
            return;
          }

          if (
            fileType ===
            (vscode.FileType.Directory | vscode.FileType.SymbolicLink)
          ) {
            // TODO(cmfcmf): Unfortunately, `vscode.workspace.fs` has not method to read the link
            // target.
            const relativeLinkTarget = await fs.readlink(
              path.join(this.srcPath, outName)
            );
            const absoluteLinkTarget = path.resolve(
              this.srcPath,
              topLevelOutDirName,
              relativeLinkTarget
            );
            let targetOutDir: string | null = null;
            if (absoluteLinkTarget.startsWith(`${this.srcPath}${path.sep}`)) {
              targetOutDir = absoluteLinkTarget.slice(this.srcPath.length + 1);
              if (targetOutDir.split(path.sep).length !== 2) {
                targetOutDir = null;
              }
            }
            if (targetOutDir === null) {
              Metrics.send({
                category: 'error',
                group: 'chromium.outputDirectories',
                description:
                  'Found symlink that does not link to any output directory',
                name: 'chromium_outputDirectories_symlink_not_linked',
              });
            }

            nodes.push(new LinkNode(outName, targetOutDir));
            return;
          }

          if (fileType === vscode.FileType.File && name === 'args.gn') {
            // It looks like this output directory is only one level deep. A lot of Chromium tooling
            // expects output directories to always be exactly two levels deep. Thus, abort here and
            // return an empty list for this top level output directory.
            throw new Error();
          }
        })
      );
    } catch (error) {
      return [];
    }

    return nodes;
  }
}
