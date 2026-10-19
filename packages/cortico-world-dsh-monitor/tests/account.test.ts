import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as zlib from 'node:zlib';
import {
  decodeSessionLog,
  humanMoney,
  humanTokens,
  localDate,
  readAccount,
  readTodayUsage,
  splitZstdFrames,
  startOfLocalDay,
  usageSamples,
} from '../src/account.ts';

let scratch: string;
beforeEach(() => { scratch = mkdtempSync(join(tmpdir(), 'dsh-account-')); });
afterEach(() => rmSync(scratch, { recursive: true, force: true }));

const compress = (text: string): Uint8Array => (zlib as unknown as {
  zstdCompressSync?: (b: Uint8Array) => Uint8Array;
}).zstdCompressSync!(Buffer.from(text, 'utf8'));

/** 一条 assistant/message 事件行。 */
function message(turn: number, step: number, time: number, usage: { i?: number; o?: number; cr?: number; cw?: number }): string {
  return JSON.stringify({
    type: 'assistant/message',
    time,
    data: { turn, step, usage: { inputTokens: usage.i ?? 0, outputTokens: usage.o ?? 0, cacheReadTokens: usage.cr ?? 0, cacheWriteTokens: usage.cw ?? 0 } },
  });
}

describe('多帧 zstd', () => {
  it('按魔数切片：两帧能拼回两段文本', () => {
    const bytes = Buffer.concat([Buffer.from(compress('aaa\n')), Buffer.from(compress('bbb\n'))]);
    expect(splitZstdFrames(bytes)).toHaveLength(2);
    expect(decodeSessionLog(bytes)).toBe('aaa\nbbb\n');
  });

  it('坏帧被跳过，不整份放弃', () => {
    const good = Buffer.from(compress('hello\n'));
    const bytes = Buffer.concat([good, Buffer.from([0x28, 0xb5, 0x2f, 0xfd, 0x00, 0x00, 0x00])]);
    expect(decodeSessionLog(bytes)).toBe('hello\n');
  });

  it('不是 zstd 的数据返回空串', () => {
    expect(decodeSessionLog(Buffer.from('plain text'))).toBe('');
  });
});

describe('usage 解析', () => {
  it('只认 assistant/message，同 turn+step 后写覆盖', () => {
    const text = [
      message(1, 1, 1000, { i: 10, o: 5 }),
      message(1, 1, 1001, { i: 12, o: 6 }),   // 覆盖上一条
      message(1, 2, 1002, { i: 20, o: 7 }),
      JSON.stringify({ type: 'tool/call', time: 1003, data: {} }),
      'not json',
      '',
    ].join('\n');
    const samples = usageSamples('s1', text);
    expect(samples.size).toBe(2);
    const first = samples.get('1:1')!;
    expect(first.input).toBe(12);
    expect(first.output).toBe(6);
    expect(first.time).toBe(1001);
    expect(samples.get('1:2')!.input).toBe(20);
  });

  it('缺 usage 或 time 的事件被忽略', () => {
    const text = [
      JSON.stringify({ type: 'assistant/message', data: { turn: 1, step: 1 } }),
      JSON.stringify({ type: 'assistant/message', time: 5, data: { turn: 1, step: 2 } }),
    ].join('\n');
    expect(usageSamples('s1', text).size).toBe(0);
  });
});

describe('今日用量', () => {
  /** 在 `root/<slug>/<session>/session.v4.jsonl.zstd` 写一份日志。 */
  function writeLog(root: string, session: string, lines: string[], mtimeMs?: number): string {
    const dir = join(root, '--D-DSH-personal--', session);
    mkdirSync(dir, { recursive: true });
    const file = join(dir, 'session.v4.jsonl.zstd');
    writeFileSync(file, Buffer.concat([Buffer.from(compress(lines.join('\n') + '\n'))]));
    if (mtimeMs !== undefined) utimesSync(file, new Date(mtimeMs), new Date(mtimeMs));
    return file;
  }

  it('只算今天的，昨天的不算', () => {
    const now = Date.now();
    const yesterday = startOfLocalDay(now) - 3 * 60 * 60 * 1000;
    const root = join(scratch, 'sessions');
    writeLog(root, 'session-today', [
      message(1, 1, now - 60_000, { i: 100, o: 50, cr: 1000 }),
      message(1, 2, now - 30_000, { i: 10, o: 5, cr: 100 }),
    ], now);
    writeLog(root, 'session-old', [
      message(1, 1, yesterday, { i: 999, o: 999 }),
    ], yesterday);

    const result = readTodayUsage(root, now);
    expect(result.ok).toBe(true);
    expect(result.usage!.requests).toBe(2);
    expect(result.usage!.sessions).toBe(1);
    expect(result.usage!.input).toBe(110);
    expect(result.usage!.output).toBe(55);
    expect(result.usage!.cacheRead).toBe(1100);
    expect(result.usage!.total).toBe(110 + 55 + 1100);
  });

  it('mtime 早于今天的日志被剪掉，不计入 scanned', () => {
    const now = Date.now();
    const root = join(scratch, 'sessions-prune');
    const old = startOfLocalDay(now) - 24 * 60 * 60 * 1000;
    writeLog(root, 'session-old', [message(1, 1, old, { o: 1 })], old);
    const result = readTodayUsage(root, now);
    expect(result.ok).toBe(false);
    expect(result.scanned!.files).toBe(0);
  });

  it('目录不存在时给出原因而不是抛错', () => {
    const result = readTodayUsage(join(scratch, 'nope'), Date.now());
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('读不到');
  });

  it('空目录给出「没有日志」', () => {
    const root = join(scratch, 'empty');
    mkdirSync(root, { recursive: true });
    const result = readTodayUsage(root, Date.now());
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('没有找到');
  });
});

describe('账号快照', () => {
  function writeAccount(dir: string, payload: unknown): void {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'account.json'), JSON.stringify(payload), 'utf8');
  }

  it('读到余额、赠金与账号名', () => {
    const dir = join(scratch, 'bridge');
    writeAccount(dir, {
      at: 1792381988588,
      status: 'ready',
      wallets: [{ currency: 'CNY', balance: '12.34' }],
      bonusWallets: [{ currency: 'CNY', balance: '5.00' }],
      profile: { id: 'u1', name: 'InfYuki' },
    });
    const account = readAccount(dir)!;
    expect(account.status).toBe('ready');
    expect(account.wallets[0]).toEqual({ currency: 'CNY', balance: '12.34' });
    expect(account.profile!.name).toBe('InfYuki');
  });

  it('文件不存在返回 null', () => {
    expect(readAccount(join(scratch, 'missing'))).toBeNull();
  });

  it('坏 JSON 返回 null', () => {
    const dir = join(scratch, 'broken');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'account.json'), '{ not json', 'utf8');
    expect(readAccount(dir)).toBeNull();
  });

  it('failed 状态原样带回，不伪造成 0', () => {
    const dir = join(scratch, 'failed');
    writeAccount(dir, { at: 1, status: 'failed' });
    const account = readAccount(dir)!;
    expect(account.status).toBe('failed');
    expect(account.wallets).toEqual([]);
  });
});

describe('给人看的格式', () => {
  it('token 按量级', () => {
    expect(humanTokens(999)).toBe('999');
    expect(humanTokens(1_500)).toBe('1.5k');
    expect(humanTokens(132_310_076)).toBe('132.31M');
  });

  it('金额带币种符号，认不出就带币种代码', () => {
    expect(humanMoney({ currency: 'CNY', balance: '12.34' })).toBe('¥12.34');
    expect(humanMoney({ currency: 'USD', balance: '0E-16' })).toBe('$0.00');
    expect(humanMoney({ currency: 'JPY', balance: '500' })).toBe('500.00 JPY');
  });

  it('本地日期与零点', () => {
    const at = new Date(2026, 9, 19, 13, 30, 0).getTime();
    expect(localDate(at)).toBe('2026-10-19');
    const start = new Date(startOfLocalDay(at));
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
  });
});
