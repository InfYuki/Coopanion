import { spawn, type ChildProcessWithoutNullStreams, type SpawnOptionsWithoutStdio } from 'node:child_process';
import { access, readdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { delimiter, extname, join } from 'node:path';
import type { CodexRateLimitSnapshot } from './types.ts';

export interface CodexAccountSnapshot {
  fetchedAt?: number;
  stale: boolean;
  error?: string;
  rateLimits: CodexRateLimitSnapshot[];
  usage?: unknown;
}

export interface CodexAccountClientOptions {
  home?: string;
  executable?: string;
  cacheMs?: number;
  timeoutMs?: number;
  maxOutputBytes?: number;
  now?: () => number;
  spawnProcess?: (executable: string, args: string[], options: SpawnOptionsWithoutStdio) => ChildProcessWithoutNullStreams;
}

type ObjectValue = Record<string, unknown>;
const object = (value: unknown): ObjectValue | undefined => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as ObjectValue : undefined;
const number = (value: unknown): number | undefined => typeof value === 'number' && Number.isFinite(value) ? value : undefined;

/** Only validated quota fields enter the monitor; reset times are milliseconds. */
export function parseAccountRateLimits(result: unknown, observedAt: number): CodexRateLimitSnapshot[] {
  const data = object(result);
  if (!data) return [];
  const buckets = object(data.rateLimitsByLimitId);
  const entries = buckets ? Object.entries(buckets) : data.rateLimits ? [['codex', data.rateLimits] as const] : [];
  return entries.flatMap(([key, value]) => {
    const limit = object(value);
    if (!limit) return [];
    const window = (value: unknown) => {
      const item = object(value);
      const usedPercent = number(item?.usedPercent);
      if (usedPercent === undefined || usedPercent < 0 || usedPercent > 100) return undefined;
      const duration = number(item?.windowDurationMins);
      const reset = number(item?.resetsAt);
      return { usedPercent, ...(duration !== undefined && duration > 0 ? { windowMinutes: duration } : {}), ...(reset !== undefined && reset > 0 ? { resetsAt: reset * 1000 } : {}) };
    };
    const credits = object(limit.credits);
    return [{
      limitId: typeof limit.limitId === 'string' ? limit.limitId : key,
      ...(typeof limit.limitName === 'string' ? { limitName: limit.limitName } : {}),
      primary: window(limit.primary), secondary: window(limit.secondary),
      ...(credits && typeof credits.hasCredits === 'boolean' && typeof credits.unlimited === 'boolean' ? { credits: { hasCredits: credits.hasCredits, unlimited: credits.unlimited, ...(typeof credits.balance === 'string' ? { balance: credits.balance } : {}) } } : {}),
      ...(typeof limit.planType === 'string' ? { planType: limit.planType } : {}),
      observedAt, source: 'app-server' as const,
    }];
  });
}

export async function discoverCodexExecutable(configured?: string): Promise<string | undefined> {
  if (configured) return /\.(cmd|bat|ps1)$/i.test(extname(configured)) ? undefined : configured;
  const names = process.platform === 'win32' ? ['codex.exe'] : ['codex'];
  const candidates = (process.env.PATH ?? '').split(delimiter).filter(Boolean).flatMap(path => names.map(name => join(path, name)));
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    const local = process.env.LOCALAPPDATA;
    const bin = join(local, 'OpenAI', 'Codex', 'bin');
    const versions = await readdir(bin, { withFileTypes: true }).catch(() => []);
    for (const dir of versions.filter(dir => dir.isDirectory()).sort((a, b) => b.name.localeCompare(a.name))) candidates.push(join(bin, dir.name, 'codex.exe'));
    candidates.push(join(local, 'Programs', 'Codex', 'resources', 'codex.exe'));
  }
  for (const candidate of candidates) {
    if (await access(candidate, process.platform === 'win32' ? constants.F_OK : constants.X_OK).then(() => true, () => false)) return candidate;
  }
  return undefined;
}

/** Each refresh owns one short-lived, read-only app-server connection. */
export class CodexAccountClient {
  private snapshot: CodexAccountSnapshot = { stale: true, rateLimits: [] };
  private attemptedAt?: number;
  private pending?: Promise<CodexAccountSnapshot>;
  private disposed = false;
  private cancel?: () => void;
  constructor(private readonly options: CodexAccountClientOptions = {}) {}

  dispose(): void {
    this.disposed = true;
    this.cancel?.();
  }

  read(): Promise<CodexAccountSnapshot> {
    if (this.disposed) return Promise.resolve({ ...this.snapshot, stale: true, error: 'codex_cancelled' });
    if (this.pending) return this.pending;
    const now = (this.options.now ?? Date.now)();
    if (this.attemptedAt !== undefined && now - this.attemptedAt < Math.max(300_000, this.options.cacheMs ?? 300_000)) return Promise.resolve(this.snapshot);
    this.attemptedAt = now;
    this.pending = this.refresh(now).finally(() => { this.pending = undefined; });
    return this.pending;
  }

  private async refresh(now: number): Promise<CodexAccountSnapshot> {
    try {
      const executable = await discoverCodexExecutable(this.options.executable);
      if (this.disposed) throw new Error('codex_cancelled');
      if (!executable) throw new Error('codex_unavailable');
      const env = { ...process.env, ...(this.options.home ? { CODEX_HOME: this.options.home } : {}) };
      const child = this.options.spawnProcess
        ? this.options.spawnProcess(executable, ['app-server'], { env, windowsHide: true, shell: false })
        : spawn(executable, ['app-server'], { env, windowsHide: true, shell: false, stdio: 'pipe' });
      const result = await this.query(child);
      this.snapshot = { fetchedAt: now, stale: false, rateLimits: parseAccountRateLimits(result.limits, now), ...(result.usage !== undefined ? { usage: result.usage } : {}) };
    } catch (error) {
      const code = error instanceof Error && ['codex_unavailable', 'codex_timeout', 'codex_output_limit', 'codex_protocol_error', 'codex_rpc_error', 'codex_process_error', 'codex_cancelled'].includes(error.message) ? error.message : 'codex_process_error';
      this.snapshot = { ...this.snapshot, stale: true, error: code };
    }
    return this.snapshot;
  }

  private async query(child: ChildProcessWithoutNullStreams): Promise<{ limits: unknown; usage?: unknown }> {
    let nextId = 0;
    let bytes = 0;
    let buffer = '';
    let failed: Error | undefined;
    const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();
    const fail = (code: string) => {
      failed ??= new Error(code);
      for (const request of pending.values()) request.reject(failed);
      pending.clear();
    };
    const kill = () => {
      if (!child.pid || child.killed || child.exitCode !== null) return;
      try { child.kill(); } catch { /* The process can exit between the state check and the signal. */ }
    };
    const timer = setTimeout(() => { fail('codex_timeout'); kill(); }, this.options.timeoutMs ?? 15_000);
    this.cancel = () => { fail('codex_cancelled'); kill(); };
    const count = (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > (this.options.maxOutputBytes ?? 1_048_576)) { fail('codex_output_limit'); kill(); return false; }
      return true;
    };
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      if (!count(Buffer.from(chunk))) return;
      buffer += chunk;
      let newline: number;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
        if (!line.trim()) continue;
        let message: ObjectValue | undefined;
        try { message = object(JSON.parse(line)); } catch { fail('codex_protocol_error'); return; }
        const request = typeof message?.id === 'number' ? pending.get(message.id) : undefined;
        if (!request || !message) continue;
        pending.delete(message.id as number);
        if (message.error) request.reject(new Error('codex_rpc_error'));
        else if ('result' in message) request.resolve(message.result);
        else request.reject(new Error('codex_protocol_error'));
      }
    });
    child.stderr.on('data', (chunk: Buffer) => { count(chunk); });
    child.on('error', () => fail('codex_process_error'));
    child.on('exit', () => fail('codex_process_error'));
    child.stdin.on('error', () => fail('codex_process_error'));
    const request = (method: string, params: ObjectValue = {}) => new Promise<unknown>((resolve, reject) => {
      if (failed) { reject(failed); return; }
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    });
    try {
      await request('initialize', { clientInfo: { name: 'coopanion_monitor', version: '1.0.0' }, capabilities: { experimentalApi: true } });
      child.stdin.write(`${JSON.stringify({ method: 'initialized', params: {} })}\n`);
      const limits = await request('account/rateLimits/read');
      const usage = await request('account/usage/read').catch(error => { if (failed) throw error; return undefined; });
      return { limits, usage };
    } finally {
      clearTimeout(timer);
      this.cancel = undefined;
      child.stdin.end();
      kill();
    }
  }
}
