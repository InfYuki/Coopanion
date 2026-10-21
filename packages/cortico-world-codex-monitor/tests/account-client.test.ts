import { spawn } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { CodexAccountClient, parseAccountRateLimits } from '../src/account-client.ts';

const fixture = (behavior = '') => `
const readline = require('node:readline');
let initialized = false;
readline.createInterface({ input: process.stdin }).on('line', line => {
 const message = JSON.parse(line);
 if(message.method === 'initialized') initialized = true;
 if(message.method.startsWith('account/') && !initialized) process.exit(2);
 ${behavior}
 if (!message.id) return;
 const result = message.method === 'initialize' ? {} : message.method === 'account/rateLimits/read'
  ? {rateLimits: {primary:{usedPercent:99}},rateLimitsByLimitId:{standard:{limitId:'standard',primary:{usedPercent:25,windowDurationMins:300,resetsAt:200}},extra:{secondary:{usedPercent:60}}}}
  : { total: { inputTokens: 42 } };
 process.stdout.write(JSON.stringify({id:message.id,result})+'\\n');
});`;

describe('Codex account client', () => {
  it('uses a short-lived initialized read-only connection and caches multiple buckets', async () => {
    let spawns = 0;
    const processes: ReturnType<typeof spawn>[] = [];
    const client = new CodexAccountClient({ executable: process.execPath, now: () => 1000, cacheMs: 1,
      spawnProcess: (_executable, args, options) => {
        expect(args).toEqual(['app-server']);
        expect(options.windowsHide).toBe(true);
        expect(options.shell).toBe(false);
        spawns++;
        const child = spawn(process.execPath, ['-e', fixture(`
          if (!['initialize','initialized','account/rateLimits/read','account/usage/read'].includes(message.method)) process.exit(2);
        `)], { stdio: 'pipe' });
        processes.push(child);
        return child;
      },
    });
    const [first, simultaneous] = await Promise.all([client.read(), client.read()]);
    expect(simultaneous).toBe(first);
    expect(first.stale).toBe(false);
    expect(first.rateLimits).toHaveLength(2);
    expect(first.rateLimits[0]).toMatchObject({ limitId: 'standard', primary: { usedPercent: 25, windowMinutes: 300, resetsAt: 200000 }, source: 'app-server' });
    expect(first.usage).toEqual({ total: { inputTokens: 42 } });
    await client.read();
    expect(spawns).toBe(1);
    expect(processes[0].killed).toBe(true);
  });

  it('keeps previous readings stale on refresh failure and throttles failures for five minutes', async () => {
    let now = 1000;
    let spawns = 0;
    const client = new CodexAccountClient({ executable: process.execPath, now: () => now, cacheMs: 1,
      spawnProcess: () => spawn(process.execPath, ['-e', ++spawns === 1 ? fixture() : `process.stderr.write('secret credential'); process.exit(1);`], { stdio: 'pipe' }),
    });
    const first = await client.read();
    now += 299_999;
    expect(await client.read()).toBe(first);
    now++;
    const stale = await client.read();
    expect(stale).toMatchObject({ fetchedAt: 1000, stale: true, error: 'codex_process_error', rateLimits: first.rateLimits });
    now++;
    expect(await client.read()).toBe(stale);
    expect(spawns).toBe(2);
    expect(JSON.stringify(stale)).not.toContain('secret');
  });

  it('terminates an unresponsive process on timeout', async () => {
    let child: ReturnType<typeof spawn> | undefined;
    const client = new CodexAccountClient({ executable: process.execPath, timeoutMs: 100,
      spawnProcess: () => child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'pipe' }),
    });
    expect(await client.read()).toMatchObject({ stale: true, error: 'codex_timeout', rateLimits: [] });
    expect(child?.killed).toBe(true);
  });

  it('bounds discarded diagnostics without exposing their content', async () => {
    const client = new CodexAccountClient({ executable: process.execPath, maxOutputBytes: 20,
      spawnProcess: () => spawn(process.execPath, ['-e', `process.stderr.write('private '.repeat(100));setInterval(() => {},1000)`], { stdio: 'pipe' }),
    });
    expect(await client.read()).toEqual({ stale: true, error: 'codex_output_limit', rateLimits: [] });
  });

  it('cancels an active refresh when the owning world stops', async () => {
    let child: ReturnType<typeof spawn> | undefined;
    let started!: () => void;
    const ready = new Promise<void>(resolve => { started = resolve; });
    const client = new CodexAccountClient({ executable: process.execPath,
      spawnProcess: () => {
        const spawned = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'pipe' });
        child = spawned;
        started();
        return spawned;
      },
    });
    const pending = client.read();
    await ready;
    client.dispose();
    expect(await pending).toMatchObject({ stale: true, error: 'codex_cancelled' });
    expect(child?.killed).toBe(true);
    expect(await client.read()).toMatchObject({ stale: true, error: 'codex_cancelled' });
  });

  it('retains quotas when older servers do not support account usage', async () => {
    const client = new CodexAccountClient({ executable: process.execPath,
      spawnProcess: () => spawn(process.execPath, ['-e', fixture(`if(message.method === 'account/usage/read') { process.stdout.write(JSON.stringify({id:message.id,error:{code:-32601,message:'private'}})+'\\n');return; }`)], { stdio: 'pipe' }),
    });
    const snapshot = await client.read();
    expect(snapshot.stale).toBe(false);
    expect(snapshot.rateLimits).toHaveLength(2);
    expect(snapshot.usage).toBeUndefined();
  });

  it('preserves unknown windows instead of manufacturing zero usage', () => {
    expect(parseAccountRateLimits({ rateLimitsByLimitId: { unknown: { primary: { usedPercent: null } } } }, 10)[0].primary).toBeUndefined();
    expect(parseAccountRateLimits({ rateLimitsByLimitId: {}, rateLimits: { primary: { usedPercent: 20 } } }, 10)).toEqual([]);
  });
});
