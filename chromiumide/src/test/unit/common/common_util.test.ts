// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import assert from 'assert';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import * as commonUtil from '../../../common/common_util';
import * as testing from '../../testing';

class SimpleLogger {
  constructor(private readonly f: (s: string) => void) {}

  append(s: string): void {
    this.f(s);
  }
}

describe('Job manager', () => {
  it('throttles jobs', async () => {
    const manager = new commonUtil.JobManager();

    const guard = await testing.BlockingPromise.new(undefined);

    const p1 = manager.offer(async () => {
      await guard.promise;
      return true;
    });

    await testing.flushMicrotasks();

    const p2 = manager.offer(async () => {
      assert.fail('Intermediate job should not run');
    });

    let p3Run = false;
    const p3 = manager.offer(async () => {
      // The last-offered job should be queued.
      p3Run = true;
    });

    // Cancelled job should return immediately.
    assert.strictEqual(await p2, null);

    assert.strictEqual(p3Run, false); // p3 should not run while p1 is running

    guard.unblock();

    assert.strictEqual(await p1, true);
    await p3;

    assert.strictEqual(p3Run, true);
  });

  it('handles errors', async () => {
    const manager = new commonUtil.JobManager();

    const guard = await testing.BlockingPromise.new(undefined);

    const p1 = manager.offer(async () => {
      await guard.promise;
      throw new Error('p1');
    });

    await testing.flushMicrotasks();

    const p2 = manager.offer(async () => {
      assert.fail('Intermediate job should not run');
    });
    const p3 = manager.offer(async () => {
      throw new Error('p3');
    });

    await p2;

    guard.unblock();
    await assert.rejects(p1);
    await assert.rejects(p3);
  });
});

describe('Logging exec', () => {
  const temp = testing.tempDir();

  it('returns stdout and logs stderr', async () => {
    let logs = '';
    const res = await commonUtil.exec('sh', ['-c', 'echo foo; echo bar 1>&2'], {
      logger: new SimpleLogger(log => {
        logs += log;
      }),
    });
    assert(!(res instanceof Error));
    assert.strictEqual(res.stdout, 'foo\n');
    assert.strictEqual(logs, "sh -c 'echo foo; echo bar 1>&2'\nbar\n");
  });

  it('mixes stdout and stderr if logStdout flag is true', async () => {
    let logs = '';
    await commonUtil.exec('sh', ['-c', 'echo foo; echo bar 1>&2'], {
      logger: new SimpleLogger(log => {
        logs += log;
      }),
      logStdout: true,
    });
    assert.strictEqual(
      logs.length,
      "sh -c 'echo foo; echo bar 1>&2'\nfoo\nbar\n".length
    );
  });

  it('returns error on non-zero exit status when unrelated flags are set', async () => {
    let logs = '';
    const res = await commonUtil.exec('sh', ['-c', 'echo foo 1>&2; exit 1'], {
      logger: new SimpleLogger(log => {
        logs += log;
      }),
      logStdout: true,
    });
    assert(res instanceof commonUtil.AbnormalExitError);
    assert(
      res.message.includes("sh -c 'echo foo 1>&2; exit 1'"),
      'actual message: ' + res.message
    );
    assert.strictEqual(logs, "sh -c 'echo foo 1>&2; exit 1'\nfoo\n");
  });

  it('returns error on non-zero exit status when no flags are specified', async () => {
    let logs = '';
    const res = await commonUtil.exec('sh', ['-c', 'echo foo 1>&2; exit 1'], {
      logger: new SimpleLogger(log => {
        logs += log;
      }),
    });
    assert(res instanceof commonUtil.AbnormalExitError);
    assert(
      res.message.includes("sh -c 'echo foo 1>&2; exit 1'"),
      'actual message: ' + res.message
    );
    assert.strictEqual(logs, "sh -c 'echo foo 1>&2; exit 1'\nfoo\n");
  });

  it('ignores non-zero exit status if ignoreNonZeroExit flag is true', async () => {
    let logs = '';
    const res = await commonUtil.exec(
      'sh',
      ['-c', 'echo foo 1>&2; echo bar; exit 1'],
      {
        logger: new SimpleLogger(log => {
          logs += log;
        }),
        ignoreNonZeroExit: true,
      }
    );
    assert(!(res instanceof Error));
    const {exitStatus, stdout, stderr} = res;
    assert.strictEqual(exitStatus, 1);
    assert.strictEqual(stdout, 'bar\n');
    assert.strictEqual(stderr, 'foo\n');
    assert.strictEqual(logs, "sh -c 'echo foo 1>&2; echo bar; exit 1'\nfoo\n");
  });

  it('appends new lines to log', async () => {
    let logs = '';
    const res = await commonUtil.exec(
      'sh',
      ['-c', 'echo -n foo; echo -n bar 1>&2;'],
      {
        logger: new SimpleLogger(log => {
          logs += log;
        }),
        logStdout: true,
      }
    );
    assert(!(res instanceof Error));
    assert.strictEqual(res.stdout, 'foo');
    assert.deepStrictEqual(logs.split('\n'), [
      "sh -c 'echo -n foo; echo -n bar 1>&2;'",
      'foobar',
      '',
    ]);
  });

  it('can supply stdin', async () => {
    const res = await commonUtil.exec('cat', [], {pipeStdin: 'foo'});
    assert(!(res instanceof Error));
    assert.strictEqual(res.stdout, 'foo');
  });

  it('returns error when the command fails', async () => {
    const res = await commonUtil.exec('does_not_exist', ['--version']);
    assert(res instanceof commonUtil.ProcessError);
    assert(
      res.message.includes('does_not_exist --version'),
      'actual message: ' + res.message
    );
  });

  it('can abort command execution', async () => {
    const canceller = new vscode.CancellationTokenSource();
    const process = commonUtil.exec('sleep', ['100'], {
      cancellationToken: canceller.token,
    });
    canceller.cancel();
    const res = await process;
    assert(res instanceof commonUtil.CancelledError);
  });

  it('supports killing the process tree when cancelling', async () => {
    const MARKER = crypto.randomUUID() + crypto.randomUUID();
    async function countRunning() {
      const psAux = await commonUtil.exec('ps', ['ax', '-o', 'command']);
      assert(!(psAux instanceof Error));
      return psAux.stdout.match(new RegExp(MARKER, 'g'))?.length ?? 0;
    }

    expect(await countRunning()).toBe(0);

    const tokenSource = new vscode.CancellationTokenSource();
    const promise = commonUtil.exec(
      'python3',
      [
        '-c',
        `import os; os.popen("python3 -c 'import time; time.sleep(10) # ${MARKER}'").read(); # ${MARKER}`,
      ],
      {
        treeKillWhenCancelling: true,
        cancellationToken: tokenSource.token,
      }
    );
    expect(promise).toBeInstanceOf(Promise);
    expect(await countRunning()).toBe(2);

    tokenSource.cancel();
    expect(await promise).toBeInstanceOf(commonUtil.CancelledError);
    expect(await countRunning()).toBe(0);
  });

  it('changes the directory if cwd is specified', async () => {
    const res = await commonUtil.exec('pwd', [], {cwd: temp.path});
    assert(!(res instanceof Error));
    expect(res.stdout).toContain(temp.path);
  });
});

describe('withTimeout utility', () => {
  it('returns before timeout', async () => {
    assert.strictEqual(
      await commonUtil.withTimeout(Promise.resolve(true), 1 /* millis*/),
      true
    );
  });

  it('returns undefined after timeout', async () => {
    const f = await testing.BlockingPromise.new(true);
    try {
      assert.strictEqual(await commonUtil.withTimeout(f.promise, 1), undefined);
    } finally {
      f.unblock();
    }
  });
});

function assertNotGitRepository(tempDir: string) {
  const tempRoot = /(\/\w+)/.exec(tempDir)![1];
  if (fs.existsSync(path.join(tempRoot, '.git'))) {
    throw new Error(
      `bad test environment: please remove ${tempRoot}/.git and rerun the test`
    );
  }
}

describe('getGitDir', () => {
  const tempDir = testing.tempDir();

  it('returns Git root directory', async () => {
    assertNotGitRepository(tempDir.path);
    const fullPath = (p: string) => path.join(tempDir.path, p);

    await testing.putFiles(tempDir.path, {
      'a/b/c/d.txt': '',
      'a/e.txt': '',
      'x/y/z.txt': '',
    });
    await commonUtil.exec('git', ['init'], {
      cwd: fullPath('a/b'),
    });
    await commonUtil.exec('git', ['init'], {cwd: fullPath('a')});

    expect(commonUtil.findGitDir(fullPath('a/b/c/d.txt'))).toEqual(
      fullPath('a/b')
    );
    expect(commonUtil.findGitDir(fullPath('a/b/c/no_such_file.txt'))).toEqual(
      fullPath('a/b')
    );
    expect(commonUtil.findGitDir(fullPath('a/b/c'))).toEqual(fullPath('a/b'));
    expect(commonUtil.findGitDir(fullPath('a/b'))).toEqual(fullPath('a/b'));
    expect(commonUtil.findGitDir(fullPath('a/e.txt'))).toEqual(fullPath('a'));
    expect(commonUtil.findGitDir(fullPath('a'))).toEqual(fullPath('a'));
    expect(commonUtil.findGitDir(fullPath('x/y/z.txt'))).toBeUndefined();
  });
});

async function increnemtCount(filepath: string) {
  const i = Number(await fs.promises.readFile(filepath, 'utf8'));
  await fs.promises.writeFile(filepath, `${i + 1}`, 'utf8');
}

describe('Mutex', () => {
  it('runs jobs sequentically', async () => {
    const m = new commonUtil.Mutex();

    const b1 = await testing.BlockingPromise.new('1');
    const b2 = await testing.BlockingPromise.new(2);

    let counter = 0;
    const either = await testing.BlockingPromise.new(undefined);

    const p1 = m.runExclusive(async () => {
      counter += 1;
      either.unblock();
      return await b1.promise;
    });
    const p2 = m.runExclusive(async () => {
      counter += 1;
      either.unblock();
      return await b2.promise;
    });

    await either.promise;

    expect(counter).toBe(1);

    b1.unblock();
    b2.unblock();

    await expectAsync(p1).toBeResolvedTo('1');
    await expectAsync(p2).toBeResolvedTo(2);

    expect(counter).toBe(2);
  });

  it('rejects if the job rejects', async () => {
    const m = new commonUtil.Mutex();

    await expectAsync(
      m.runExclusive(async () => {
        throw new Error('foo');
      })
    ).toBeRejectedWithError('foo');
  });

  const tempDir = testing.tempDir();
  it('allows to update the same file', async () => {
    const n = 10;

    const file = path.join(tempDir.path, 'num.txt');
    await fs.promises.writeFile(file, '0', 'utf8');

    // Demonstrates updating a file concurrently fails.
    const unguardedPromises = [];
    for (let i = 0; i < n; i++) {
      unguardedPromises.push(increnemtCount(file));
    }
    await Promise.all(unguardedPromises);
    await expectAsync(fs.promises.readFile(file, 'utf8')).not.toBeResolvedTo(
      '' + n
    );

    // Updating a file works as expected if guarded by a mutex.
    await fs.promises.writeFile(file, '0', 'utf8');
    const m = new commonUtil.Mutex();
    const guardedPromises = [];
    for (let i = 0; i < n; i++) {
      guardedPromises.push(m.runExclusive(() => increnemtCount(file)));
    }
    await Promise.all(guardedPromises);
    await expectAsync(fs.promises.readFile(file, 'utf8')).toBeResolvedTo(
      '' + n
    );
  });
});

describe('CacheOnSuccess', () => {
  it('makes one on call on success', async () => {
    let callCounter = 0;
    const cacheOnSuccess = new commonUtil.CacheOnSuccess(async () => {
      callCounter += 1;
      return 'ok';
    });

    expect(await cacheOnSuccess.getOrThrow()).toEqual('ok');
    expect(await cacheOnSuccess.getOrThrow()).toEqual('ok');
    expect(callCounter).toEqual(1);
  });

  it('makes one retry on error', async () => {
    let doThrow = true;
    let callCounter = 0;

    const cacheOnSuccess = new commonUtil.CacheOnSuccess(async () => {
      callCounter += 1;
      if (doThrow) {
        throw new Error('testing retries');
      }
      return 'ok';
    });

    await expectAsync(cacheOnSuccess.getOrThrow()).toBeRejected();
    doThrow = false;
    await expectAsync(cacheOnSuccess.getOrThrow()).toBeResolvedTo('ok');
    await expectAsync(cacheOnSuccess.getOrThrow()).toBeResolvedTo('ok');
    expect(callCounter).toEqual(2);
  });

  it('reuses promises', async () => {
    let promiseCount = 0;

    const cacheOnSuccess = new commonUtil.CacheOnSuccess(async () => {
      promiseCount += 1;
      return 'ok';
    });

    const p1 = cacheOnSuccess.getOrThrow();
    const p2 = cacheOnSuccess.getOrThrow();

    await expectAsync(p1).toBeResolvedTo('ok');
    await expectAsync(p2).toBeResolvedTo('ok');

    expect(promiseCount).toEqual(1);
  });
});
