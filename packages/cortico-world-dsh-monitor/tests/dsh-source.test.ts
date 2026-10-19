import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { aggregate, isRunning, isSettled, parseProjection, readSessions, sumTokens, defaultCacheDir } from '../src/dsh-source.ts';
import { projectionJson, writeProjections } from './helpers/fixtures.ts';

let scratch: string;
beforeEach(() => { scratch = mkdtempSync(join(tmpdir(), 'dsh-source-')); });
afterEach(() => rmSync(scratch, { recursive: true, force: true }));

describe('投影缓存解析', () => {
  it('取出 token 四项、会话统计与上下文压力', () => {
    const raw = projectionJson({
      title: '重构认证模块',
      totals: { uncachedInputTokens: 680_000, outputTokens: 150_000, cacheReadTokens: 56_000_000, cacheWriteTokens: 0 },
      turns: 11,
      steps: 234,
      context: { surfaceTokens: 306_000, contextWindow: 1_000_000, pressureTokens: 424_000 },
      seq: 1688,
    });
    const snap = parseProjection(raw);
    expect(snap).not.toBeNull();
    expect(snap!.title).toBe('重构认证模块');
    expect(snap!.seq).toBe(1688);
    expect(snap!.tokenTotals).toEqual({
      uncachedInputTokens: 680_000,
      outputTokens: 150_000,
      cacheReadTokens: 56_000_000,
      cacheWriteTokens: 0,
    });
    expect(snap!.stats.turns).toBe(11);
    expect(snap!.stats.steps).toBe(234);
    expect(snap!.context.contextWindow).toBe(1_000_000);
  });

  it('正在跑的会话：openStep 与 openTurnStartSeq 都有值', () => {
    const snap = parseProjection(projectionJson({ running: true, turns: 11, openTurnStartSeq: 1373 }))!;
    expect(snap.stats.openStep).not.toBeNull();
    expect(snap.turnBoundary.openTurnStartSeq).toBe(1373);
    expect(isRunning(snap)).toBe(true);
    expect(isSettled(snap)).toBe(false);
  });

  it('已结算的会话：三项一起归位', () => {
    const snap = parseProjection(projectionJson({ running: false, turns: 3, lastStepKind: 'end' }))!;
    expect(snap.stats.openStep).toBeNull();
    expect(snap.turnBoundary.openTurnStartSeq).toBeNull();
    expect(snap.turnBoundary.lastStepKind).toBe('end');
    expect(isRunning(snap)).toBe(false);
    expect(isSettled(snap)).toBe(true);
  });

  it('坏文件与结构不符的 JSON 都不抛错，只计入 unreadable', () => {
    const dir = mkdtempSync(join(scratch, 'bad-'));
    writeProjections(dir, { 'ok-session': { title: 'ok', totals: { outputTokens: 1 } } });
    writeFileSync(join(dir, 'broken.json'), '{ not json', 'utf8');
    writeFileSync(join(dir, 'wrong-shape.json'), '{"version":7}', 'utf8');
    const read = readSessions(dir);
    expect(read.sessions).toHaveLength(1);
    expect(read.unreadable).toBe(2);
  });

  it('目录不存在时返回空结果而不是抛错', () => {
    const read = readSessions(join(scratch, 'nope'));
    expect(read.sessions).toEqual([]);
    expect(read.unreadable).toBe(0);
  });

  it('按 mtime 倒序给出会话，最近活动的在前', async () => {
    const dir = writeProjections(join(scratch, 'multi'), {
      older: { title: '老会话', totals: { outputTokens: 10 } },
    });
    await new Promise((r) => setTimeout(r, 20));
    writeProjections(dir, { newer: { title: '新会话', totals: { outputTokens: 20 } } });
    const read = readSessions(dir);
    expect(read.sessions[0].title).toBe('新会话');
    expect(read.sessions.map((s) => s.title)).toEqual(['新会话', '老会话']);
  });

  it('sinceMs 过滤掉旧的投影', () => {
    const dir = writeProjections(join(scratch, 'since'), { a: { title: 'a', totals: { outputTokens: 5 } } });
    const read = readSessions(dir, { sinceMs: Date.now() + 60_000 });
    expect(read.sessions).toEqual([]);
  });
});

describe('聚合', () => {
  it('跨会话四项分别求和', () => {
    const a = parseProjection(projectionJson({ totals: { uncachedInputTokens: 10, outputTokens: 20 } }))!;
    const b = parseProjection(projectionJson({ totals: { uncachedInputTokens: 1, outputTokens: 2, cacheReadTokens: 3 } }))!;
    const total = aggregate([a, b]);
    expect(total).toEqual({ uncachedInputTokens: 11, outputTokens: 22, cacheReadTokens: 3, cacheWriteTokens: 0 });
    expect(sumTokens(total)).toBe(36);
  });

  it('空集合全为 0', () => {
    expect(sumTokens(aggregate([]))).toBe(0);
  });
});

describe('目录推导', () => {
  it('DSH_HOME 覆盖时跟着走', () => {
    expect(defaultCacheDir({ DSH_HOME: 'C:\\custom\\.dsh' })).toBe(join('C:\\custom\\.dsh', 'storages', 'session_projcache', 'sessions'));
  });

  it('没有 DSH_HOME 时回退到 ~/.dsh/storages/session_projcache/sessions', () => {
    expect(defaultCacheDir({ USERPROFILE: 'C:\\Users\\x' })).toBe(join('C:\\Users\\x', '.dsh', 'storages', 'session_projcache', 'sessions'));
    // HOME 是第二顺位，末位是 '.'（永远不会再给出空串）
    expect(defaultCacheDir({ HOME: '/home/x' })).toBe(join('/home/x', '.dsh', 'storages', 'session_projcache', 'sessions'));
    expect(defaultCacheDir({})).toBe(join('.', '.dsh', 'storages', 'session_projcache', 'sessions'));
    // 空白 DSH_HOME 等同于缺失
    expect(defaultCacheDir({ DSH_HOME: '   ', USERPROFILE: 'C:\\Users\\x' })).toBe(join('C:\\Users\\x', '.dsh', 'storages', 'session_projcache', 'sessions'));
  });
});
