// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as childProcess from 'child_process';

type Tag = {
    key: string;
    value?: string;
};

type Build = {
    id: string;
    createdBy: string;
    createTime: string;
    startTime: string;
    status: string;
    tags: Tag[];
};

type DUT = {
    Hostname: string;
};

type Lease = {
    Build: Build;
    DUT: DUT;
};

type Leases = {
    Leases: Lease[];
};

type ExecFileResult = {
    stdout: string;
    stderr: string
};

async function execFile(file: string, args: ReadonlyArray<string> | undefined | null): Promise<ExecFileResult> {
    return new Promise((resolve, reject) => {
        childProcess.execFile(file, args, (error, stdout, stderr) => {
            if (error !== null) {
                reject(error);
                return;
            }
            resolve({ stdout, stderr });
        });
    });
}

export async function crosfleetLeases(): Promise<Leases> {
    const out = await execFile('crosfleet', ['dut', 'leases', '-json']);
    // TODO: validation...
    return JSON.parse(out.stdout) as Leases;
}

export function crosfleetBoard(lease: Lease): string | undefined {
    for (const tag of lease.Build.tags) {
        if (tag.key === 'label-board') {
            return tag.value;
        }
    }
    return undefined;
}

export type LeaseOpts = {
    board?: string;
    //dev?: boolean;
    //dims?: {key: string, value: string}[];
    //host?: string;
    minutes?: number;
    //model?: string;
    reason?: string;
};

export async function crosfleetDutLease(opts?: LeaseOpts): Promise<Lease> {
    const args = ['dut', 'lease', '-json'];
    if (opts?.board !== undefined) {
        args.push('-board', opts?.board);
    }
    if (opts?.minutes !== undefined) {
        args.push('-minutes', opts?.minutes.toFixed(0));
    }
    if (opts?.reason !== undefined) {
        args.push('-reason', opts?.reason);
    }
    const out = await execFile('crosfleet', args);
    return JSON.parse(out.stdout) as Lease;
}

export async function crosfleetDutAbandon(host: string){
    await execFile('crosfleet', ['dut', 'abandon', host]);
}
