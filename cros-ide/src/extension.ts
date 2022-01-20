// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as vscode from 'vscode';
import childProcess = require('child_process');
import { crosfleetDutLease, crosfleetLeases, crosfleetDutAbandon } from './crosfleet';
import { resolve } from 'path';
import { rejects } from 'assert';

function execAsync(command: string): Promise<{stdout: string, stderr:string}> {
	return new Promise((resolve, reject) => {
		childProcess.exec(command, (error, stdout, stderr) => {
			if (error !== null) {
				reject(error);
				return;
			}
			resolve({stdout, stderr});
		});
	});
}
export function activate(context: vscode.ExtensionContext) {
	const staticDevicesProvider = new StaticDevicesProvider();
	const fleetDevicesProvider = new FleetDevicesProvider();
	const sessions = new Map<string, Session>();

	context.subscriptions.push(
		vscode.commands.registerCommand('cros-ide.connectToHostForScreen', async (host?: string) => {
			// If the command is selected directly from the command palette,
			// prompt the user for the host to connect to.
			if (!host) {
				host = await promptHost('Connect to Host');
				if (!host) {
					return;
				}
			}

			// If there's an existing session, just reveal its panel.
			const existingSession = sessions.get(host);
			if (existingSession) {
				existingSession.revealPanel();
				return;
			}

			// Create a new session and store it to sessions.
			const newSession = new Session(host, context.extensionUri);
			sessions.set(host, newSession);
			newSession.onDidDispose(() => {
				sessions.delete(host!);
			});
		}),
		vscode.commands.registerCommand('cros-ide.connectToHostForShell', async (host?: string) => {
			// If the command is selected directly from the command palette,
			// prompt the user for the host to connect to.
			if (!host) {
				host = await promptHost('Connect to Host');
				if (!host) {
					return;
				}
			}

			// Create a new terminal.
			const terminal = createTerminalForHost(host, 'CrOS: Shell', context.extensionUri, '');
			terminal.show();
		}),
		vscode.commands.registerCommand('cros-ide.addHost', async () => {
			const host = await promptHost('Add New Host');
			if (!host) {
				return;
			}

			const configRoot = getConfigRoot();
			const hosts = configRoot.get<string[]>('hosts') || [];
			hosts.push(host);
			configRoot.update('hosts', hosts, vscode.ConfigurationTarget.Global);
		}),
		vscode.commands.registerCommand('cros-ide.deleteHost', async (host?: string) => {
			// If the command is selected directly from the command palette,
			// prompt the user for the host to connect to.
			if (!host) {
				host = await promptHost('Delete Host');
				if (!host) {
					return;
				}
			}

			//Try deleting crossfleet first. If not found, then try deleting from "my devices"
			if (!fleetDevicesProvider.removeTreeItem(host)){
				const configRoot = getConfigRoot();
				const oldHosts = configRoot.get<string[]>('hosts') || [];
				const newHosts = oldHosts.filter((h) => (h !== host));
				configRoot.update('hosts', newHosts, vscode.ConfigurationTarget.Global);
			}
		}),
		vscode.commands.registerCommand('cros-ide.refreshCrosfleet', () => {
			fleetDevicesProvider.updateCache();
		}),
		vscode.commands.registerCommand('cros-ide.addFleetHost', async () => {
			const board = await promptBoard('Model');
			const lease = await crosfleetDutLease({board});
			// HACK: copy over binaries.
      // TODO: Removing prebuilts till we have an alterative solution
			// const prebuilt = vscode.Uri.joinPath(context.extensionUri, 'resources', 'novnc-prebuilt.tar.gz');
			// await execAsync(`ssh ${lease.DUT.Hostname + '.cros'} tar xz -C /usr/local < ${prebuilt.fsPath}`);
			// fleetDevicesProvider.updateCache();
		}),
		vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration('cros')) {
				staticDevicesProvider.onConfigChanged();
			}
		}),
		vscode.window.registerTreeDataProvider('static-devices', staticDevicesProvider),
		vscode.window.registerTreeDataProvider('fleet-devices', fleetDevicesProvider),
	);
}

async function promptHost(title: string): Promise<string | undefined> {
	return await vscode.window.showInputBox({
		title: title,
		placeHolder: 'host[:port]',
	});
}

async function promptBoard(title: string): Promise<string | undefined> {
	return await vscode.window.showInputBox({
		title: title,
		placeHolder: 'board',
	});
}

class Session {
	private static nextAvailablePort = 6080;

	private readonly localPort: number;
	private readonly terminal: vscode.Terminal;
	private readonly panel: vscode.WebviewPanel;
	private disposed = false;

	private onDidDisposeEmitter = new vscode.EventEmitter<void>();
	readonly onDidDispose = this.onDidDisposeEmitter.event;

	constructor(private readonly host: string, readonly extensionUri: vscode.Uri) {
		// Here we do the following:
		// 1. Choose a local port
		// 2. Start an SSH session for SSH tunnel and to start kmsvnc and novnc
		// 3. Create tab to display VNC contents
		this.localPort = Session.nextAvailablePort++;
		this.terminal = Session.startVncServer(host, this.localPort, extensionUri);
		this.panel = Session.createWebview(host, this.localPort);

		// Dispose the session when the panel is closed.
		this.panel.onDidDispose(() => {
			this.dispose();
		});
	}

	dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;

		this.terminal.dispose();
		this.panel.dispose();
		this.onDidDisposeEmitter.fire();
	}

	revealPanel(): void {
		this.panel.reveal();
	}

	private static startVncServer(host: string, localPort: number, extensionUri: vscode.Uri): vscode.Terminal {
		const terminal = createTerminalForHost(host, 'CrOS: VNC forwarding', extensionUri, `-L ${localPort}:localhost:6080`);
		terminal.sendText('fuser -k 5900/tcp 6080/tcp');
		terminal.sendText('kmsvnc &');
		terminal.sendText('novnc &');
		return terminal;
	}

	private static createWebview(host: string, localPort: number): vscode.WebviewPanel {
		const panel = vscode.window.createWebviewPanel(
			'vncclient',
			`CrOS VNC Client: ${host}`,
			vscode.ViewColumn.One,
			{
				enableScripts: true,
				// https://code.visualstudio.com/api/extension-guides/webview#retaincontextwhenhidden
				retainContextWhenHidden: true
			}
		);
		panel.webview.html = Session.getWebviewContent(localPort);
		return panel;
	}

	private static getWebviewContent(localPort: number) {
		return `<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<title>CrOS VNC Client</title>
			<style>
				html, body {
					margin: 0;
					padding: 0;
					height: 100%;
				}
				#main {
					border: 0;
					width: 100%;
					height: 100%;
				}
			</style>
		</head>
		<body>
			<iframe
			  id="main"
			  title="iframe"
				sandbox="allow-scripts allow-same-origin">
			</iframe>
			<script>
  			// Navigate after 5 seconds.
			  setTimeout(() => {
					document.getElementById('main').src = 'http://localhost:${localPort}/vnc.html?resize=scale&autoconnect=true';
				}, 5000);
			</script>
		</body>
		</html>`;
	}
}

function createTerminalForHost(host: string, namePrefix: string, extensionUri: vscode.Uri, extraOptions: string): vscode.Terminal {
	const testingRsa = vscode.Uri.joinPath(extensionUri, 'resources', 'testing_rsa');
	const terminal = vscode.window.createTerminal(`${namePrefix} ${host}`);
	const splitHost = host.split(':');
	let portOption = '';
	if (splitHost.length === 2) {
		host = splitHost[0];
		portOption = `-p ${splitHost[1]}`;
	}
	terminal.sendText(`ssh -i ${testingRsa.fsPath} ${extraOptions} ${portOption} root@${host}; exit $?`);
	return terminal;
}

class StaticDevicesProvider implements vscode.TreeDataProvider<string> {
	private readonly cachedVersions = new Map<string, string>();

	private onDidChangeTreeDataEmitter = new vscode.EventEmitter<string | undefined | null | void>();
	readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

	constructor() {
		this.queryVersions();
	}

	getTreeItem(host: string): DeviceInfo {
		return new DeviceInfo(host, this.cachedVersions.get(host) || '');
	}

	getChildren(parent?: string): string[] {
		if (parent) {
			return [];
		}
		return this.getHosts();
	}

	onConfigChanged(): void {
		this.queryVersions();
		this.onDidChangeTreeDataEmitter.fire();
		// Async, query crosfleet if it exists
		// Refire emitter when we get results in
	}

	private queryVersions(): void {
		for (const host of this.getHosts()) {
			if (this.cachedVersions.has(host)) {
				continue;
			}
			(async () => {
				let version = '???';
				try {
					version = await queryHostVersion(host);
				} catch (_) {}
  			this.cachedVersions.set(host, version);
				this.onDidChangeTreeDataEmitter.fire();
			})().catch((e) => { });
		}
	}

	private getHosts(): string[] {
		return getConfigRoot().get<string[]>('hosts') || [];
	}
}

export type CrosfleetDutInfo = {
	hostname: string;
	version?: string;
};

class FleetDevicesProvider implements vscode.TreeDataProvider<string> {
	private leases: Map<string, CrosfleetDutInfo>;

	private onDidChangeTreeDataEmitter = new vscode.EventEmitter<string | undefined | null | void>();
	readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

	constructor() {
		this.leases = new Map();
		this.updateCache();
	}

	async updateCache() {
		// TODO: animations while we are loading?
		// Query duts.
		const leases = await crosfleetLeases();
		this.leases = new Map(leases.Leases.map(l => [
			l.DUT.Hostname + '.cros',	// Key.
			{	// Value.
				hostname: l.DUT.Hostname + '.cros',
			},
		]));
		this.onDidChangeTreeDataEmitter.fire();

		// Update versions in parallel.
		for (const dut of this.leases.values()) {
			if (dut.version !== undefined) {
				continue;
			}
			(async () => {
				let version = '???';
				try {
					version = await queryHostVersion(dut.hostname);
				} catch (_) {}
  				dut.version = version;
				this.onDidChangeTreeDataEmitter.fire();
			})().catch((e) => { });
		}
	}

	async removeTreeItem(host: string): Promise<boolean>{
		if (this.leases.delete(host)){
			//execFile('crosfleet', ['dut', 'abandon', host])
			await crosfleetDutAbandon(host);
			this.onDidChangeTreeDataEmitter.fire();
			return true;
		}else{
			return false;
		}
	}

	getTreeItem(host: string): DeviceInfo {
		return new DeviceInfo(host, this.leases.get(host)?.version || '');
	}

	getChildren(parent?: string): string[] {
		if (parent) {
			return [];
		}
		return [...this.leases.keys()];
	}

	private queryDuts(): void {
		crosfleetLeases().then();
	}

	private getHosts(): string[] {
		return getConfigRoot().get<string[]>('hosts') || [];
	}
}

class DeviceInfo extends vscode.TreeItem {
	constructor(host: string, version: string) {
		super(host, vscode.TreeItemCollapsibleState.None);
		this.description = version;
		this.iconPath = new vscode.ThemeIcon('device-desktop');
	}
}

const BUILDER_PATH_RE = /CHROMEOS_RELEASE_BUILDER_PATH=(.*)/;

async function queryHostVersion(host: string): Promise<string> {
	const output = await runSSH(host, ['cat', '/etc/lsb-release']);
	const match = BUILDER_PATH_RE.exec(output);
	if (!match) {
		throw new Error(`Failed to connect to ${host}`);
	}
	return match[1];
}

function runSSH(host: string, args: string[]): Promise<string> {
	return new Promise((resolve, reject) => {
		childProcess.execFile('ssh', [host].concat(args), (error, stdout) => {
			if (error) {
				reject(error);
				return;
			}
			resolve(stdout);
		});
	});
}

function getConfigRoot(): vscode.WorkspaceConfiguration {
	return vscode.workspace.getConfiguration('cros');
}
