import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ToolCallContext } from 'cortico/core/types.ts';
import { dryMountWorld } from 'cortico/extensions/dry-mount.ts';
import { DSH_MONITOR } from '../src/definition.ts';
import { DSH_MONITOR_DEFAULTS } from '../src/config.ts';
import { DshMonitorWorld } from '../src/world.ts';
import { FakeHost } from './helpers/fake-host.ts';
import { writeProjections } from './helpers/fixtures.ts';

let scratch: string;
beforeEach(() => { scratch = mkdtempSync(join(tmpdir(), 'dsh-monitor-world-')); });
afterEach(() => rmSync(scratch, { recursive: true, force: true }));

const call = {} as ToolCallContext;

/** 造一个指向临时投影目录的 World，`now` 固定，方便断言时间相关行为。 */
function makeWorld(opts: { cacheDir: string; now?: number; enabled?: boolean }): DshMonitorWorld {
  return new DshMonitorWorld({
    cfg: { ...DSH_MONITOR_DEFAULTS, enabled: opts.enabled ?? true, cacheDir: opts.cacheDir },
    timezone: 'Asia/Shanghai',
    persist: () => {},
    stateFile: join(scratch, 'state.json'),
    now: () => opts.now ?? Date.now(),
  });
}

describe('DSH 监控 World：装配契约', () => {
  it('干装载不报失败：装载器会接受它', async () => {
    const report = await dryMountWorld(DSH_MONITOR, { scratchDir: scratch });
    expect(report.failures).toEqual([]);
  });

  it('实例 id 与定义一致，四个工具都带 handler', () => {
    const world = DSH_MONITOR.create({
      id: DSH_MONITOR.id,
      cfg: { ...DSH_MONITOR_DEFAULTS },
      timezone: 'Asia/Shanghai',
      botName: 'Coo',
      botDir: scratch,
      packageDir: scratch,
      dataDir: scratch,
      repoRoot: scratch,
      secret: () => '',
      storeSecret: () => {},
      persist: () => {},
      restart: async () => {},
    });
    expect(world.id).toBe(DSH_MONITOR.id);
    const tools = world.tools();
    expect(tools.map((t) => t.name)).toEqual(['dsh_status', 'dsh_usage', 'dsh_tasks', 'dsh_balance']);
    for (const tool of tools) expect(typeof tool.handler).toBe('function');
  });
});

describe('DSH 监控 World：工具回执', () => {
  it('读不到目录时如实报告，不编数字', async () => {
    const world = makeWorld({ cacheDir: join(scratch, 'missing') });
    const status = world.tools().find((t) => t.name === 'dsh_status')!;
    const text = String(await status.handler({}, call));
    expect(text).toContain('读不到');
    expect(text).toContain('missing');
  });

  it('dsh_usage 分列四项 token', async () => {
    const dir = writeProjections(join(scratch, 'cache'), {
      s1: { title: '重构', totals: { uncachedInputTokens: 1_000, outputTokens: 2_000, cacheReadTokens: 3_000 } },
    });
    const world = makeWorld({ cacheDir: dir });
    const usage = world.tools().find((t) => t.name === 'dsh_usage')!;
    const text = String(await usage.handler({ scope: 'total' }, call));
    expect(text).toContain('未命中缓存的输入');
    expect(text).toContain('输出');
    expect(text).toContain('缓存命中');
  });

  it('dsh_usage 逐会话按用量倒序', async () => {
    const dir = writeProjections(join(scratch, 'cache2'), {
      small: { title: '小会话', totals: { outputTokens: 10 } },
      big: { title: '大会话', totals: { outputTokens: 9_000 } },
    });
    const world = makeWorld({ cacheDir: dir });
    const usage = world.tools().find((t) => t.name === 'dsh_usage')!;
    const text = String(await usage.handler({ scope: 'sessions' }, call));
    expect(text.indexOf('大会话')).toBeLessThan(text.indexOf('小会话'));
  });

  it('dsh_tasks 列出在跑的会话与目标', async () => {
    const dir = writeProjections(join(scratch, 'cache3'), {
      live: {
        title: '做扩展',
        running: true,
        turns: 2,
        steps: 9,
        goal: { id: 'g1', revision: 1, objective: '把两个扩展做完', phase: 'active', roundsStarted: 1, maxGoalRounds: 40 },
        todos: [{ content: '写代码', status: 'in_progress' }, { content: '写测试', status: 'pending' }],
      },
    });
    const world = makeWorld({ cacheDir: dir });
    const tasks = world.tools().find((t) => t.name === 'dsh_tasks')!;
    const text = String(await tasks.handler({}, call));
    expect(text).toContain('在跑');
    expect(text).toContain('把两个扩展做完');
    expect(text).toContain('待办 0/2');
  });
});

describe('DSH 监控 World：事件', () => {
  it('挂载时只建基线，不把旧账念一遍', async () => {
    const dir = writeProjections(join(scratch, 'cache4'), {
      s1: { title: '老会话', turns: 5, totals: { outputTokens: 1_000 } },
    });
    const world = makeWorld({ cacheDir: dir, now: 1_000_000 });
    const host = new FakeHost();
    await world.start(host);
    expect(host.events).toEqual([]);
    await world.stop();
  });

  it('发现会话多做了一轮且已结算 → 推一条 dsh.task.completed，trigger 是 preempt', async () => {
    const dir = join(scratch, 'cache5');
    writeProjections(dir, { s1: { title: '老会话', turns: 1, totals: { outputTokens: 100 } } });
    // 默认关着（进度/完成由桌宠自己弹气泡），这里的这条测试要的是「打开时」的行为
    const world = new DshMonitorWorld({
      cfg: { ...DSH_MONITOR_DEFAULTS, enabled: true, cacheDir: dir, reportCompleted: true },
      timezone: 'Asia/Shanghai',
      persist: () => {},
      stateFile: join(scratch, 'state5.json'),
      now: () => 1_000_000,
    });
    const host = new FakeHost();
    await world.start(host);                       // 基线：turns=1
    // 会话推进到 2 轮并结算，文件时间回拨到「已经安静很久」
    writeProjections(dir, { s1: { title: '老会话', turns: 2, totals: { outputTokens: 200 } } });
    const { utimesSync } = await import('node:fs');
    const old = new Date(1_000_000 - 10 * 60_000);
    utimesSync(join(dir, 's1.json'), old, old);
    await world.tick({});
    expect(host.events).toHaveLength(1);
    expect(host.events[0].type).toBe('dsh.task.completed');
    expect(host.events[0].origin).toBe('internal');
    expect(host.events[0].text).toContain('第 2 轮');
    expect(host.pushOpts[0]?.trigger).toBe('preempt');
    await world.stop();
  });

  it('reportCompleted 关掉时不推完成事件', async () => {
    const dir = join(scratch, 'cache6');
    writeProjections(dir, { s1: { title: '老会话', turns: 1, totals: { outputTokens: 100 } } });
    const world = new DshMonitorWorld({
      cfg: { ...DSH_MONITOR_DEFAULTS, enabled: true, cacheDir: dir, reportCompleted: false },
      timezone: 'Asia/Shanghai',
      persist: () => {},
      stateFile: join(scratch, 'state6.json'),
      now: () => 1_000_000,
    });
    const host = new FakeHost();
    await world.start(host);
    writeProjections(dir, { s1: { title: '老会话', turns: 2, totals: { outputTokens: 200 } } });
    const { utimesSync } = await import('node:fs');
    const old = new Date(1_000_000 - 10 * 60_000);
    utimesSync(join(dir, 's1.json'), old, old);
    await world.tick({});
    expect(host.events).toEqual([]);
    await world.stop();
  });

  it('enabled 关掉后什么都不推', async () => {
    const dir = join(scratch, 'cache7');
    writeProjections(dir, { s1: { title: '老会话', turns: 1, totals: { outputTokens: 100 } } });
    const world = makeWorld({ cacheDir: dir, now: 1_000_000, enabled: false });
    const host = new FakeHost();
    await world.start(host);
    writeProjections(dir, { s1: { title: '老会话', turns: 2, totals: { outputTokens: 200 } } });
    const { utimesSync } = await import('node:fs');
    const old = new Date(1_000_000 - 10 * 60_000);
    utimesSync(join(dir, 's1.json'), old, old);
    await world.tick({});
    expect(host.events).toEqual([]);
    await world.stop();
  });

  it('stop() 后定时器不再触发：清理干净', async () => {
    const dir = writeProjections(join(scratch, 'cache8'), { s1: { title: 'x', turns: 1 } });
    const world = makeWorld({ cacheDir: dir });
    const host = new FakeHost();
    await world.start(host);
    await world.stop();
    // stop 之后再 tick 一次也不该抛错或推事件
    await world.tick({});
    expect(host.events).toEqual([]);
  });
});

describe('DSH 监控 World：提示词变量', () => {
  it('变量集合与模板占位符一一对应', async () => {
    const dir = writeProjections(join(scratch, 'cache9'), {
      s1: { title: '跑着的', running: true, turns: 1, totals: { outputTokens: 500 } },
    });
    const world = makeWorld({ cacheDir: dir });
    const vars = await world.envPromptVars();
    expect(Object.keys(vars).sort()).toEqual([
      'dsh.balance', 'dsh.cacheDir', 'dsh.cacheReadTokens', 'dsh.inputTokens', 'dsh.lastActivity',
      'dsh.lastNotice', 'dsh.live', 'dsh.outputTokens', 'dsh.runningTitles', 'dsh.sessions', 'dsh.today',
    ].sort());
    expect(vars['dsh.live']).toBe('1');
    expect(vars['dsh.runningTitles']).toContain('跑着的');
  });
});
