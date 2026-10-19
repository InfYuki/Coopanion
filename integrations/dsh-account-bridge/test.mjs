// The bridge has no framework dependencies, so it is tested with node:test and a fake Host ctx.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apply, collect, defaultDir, writeJson } from './index.js';

const CLIENT = { version: '1.0.0', locale: 'zh-CN', timezoneOffsetSeconds: 28800 };

/** A fake Host account service; `behaviour` decides what each call does. */
function fakeAccount(behaviour) {
  return {
    async getState() { return behaviour.state ?? { status: 'credential-stored' }; },
    async getBalance() {
      if (behaviour.balance instanceof Error) throw behaviour.balance;
      return behaviour.balance;
    },
    async getProfile() {
      if (behaviour.profile instanceof Error) throw behaviour.profile;
      return behaviour.profile ?? null;
    },
  };
}

/** A Host context shaped like the real one: `get(name)` reaches a service, `on('dispose')` cleans up. */
function fakeCtx(services = {}) {
  const disposed = [];
  return {
    ctx: {
      get: (name) => services[name],
      on: (event, listener) => { disposed.push({ event, listener }); },
    },
    disposed,
  };
}

const READY = {
  state: { status: 'credential-stored' },
  balance: { status: 'ready', value: [{ currency: 'CNY', balance: '12.34' }], bonusWallets: [{ currency: 'CNY', balance: '5.00' }] },
  profile: { status: 'ready', value: { id: 'u1', name: 'InfYuki' } },
};

/** Read one of the files `apply` writes. */
const read = (dir, name) => JSON.parse(readFileSync(join(dir, name), 'utf8'));

test('ready: 发布充值余额、赠金与账号名，金额保持字符串', async () => {
  const got = await collect(fakeAccount(READY), CLIENT);
  assert.equal(got.status, 'ready');
  assert.deepEqual(got.wallets, [{ currency: 'CNY', balance: '12.34' }]);
  assert.deepEqual(got.bonusWallets, [{ currency: 'CNY', balance: '5.00' }]);
  assert.deepEqual(got.profile, { id: 'u1', name: 'InfYuki' });
});

test('未登录：signed-out，不去查余额', async () => {
  let asked = false;
  const account = fakeAccount({ state: { status: 'signed-out' } });
  account.getBalance = async () => { asked = true; return null; };
  assert.equal((await collect(account, CLIENT)).status, 'signed-out');
  assert.equal(asked, false);
});

test('查询期间登录态变化（balance 返回 null）：signed-out', async () => {
  assert.equal((await collect(fakeAccount({ ...READY, balance: null }), CLIENT)).status, 'signed-out');
});

test('Platform 拒绝：failed —— 绝不伪造成 0 余额', async () => {
  const got = await collect(fakeAccount({ ...READY, balance: { status: 'failed' } }), CLIENT);
  assert.equal(got.status, 'failed');
  assert.equal('wallets' in got, false);
});

test('调用抛错：error，带一句话原因', async () => {
  const got = await collect(fakeAccount({ ...READY, balance: new Error('network down') }), CLIENT);
  assert.equal(got.status, 'error');
  assert.equal(got.error, 'network down');
});

test('账号名取不到不影响余额', async () => {
  const got = await collect(fakeAccount({ ...READY, profile: new Error('nope') }), CLIENT);
  assert.equal(got.status, 'ready');
  assert.equal(got.profile, null);
});

test('writeJson 原子写入，落盘是合法 JSON', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bridge-'));
  try {
    writeJson(dir, 'account.json', { status: 'ready', wallets: [] });
    const parsed = read(dir, 'account.json');
    assert.equal(parsed.status, 'ready');
    assert.equal(typeof parsed.at, 'number');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('apply 一开始就留标记文件（证明它真的跑了）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bridge-mark-'));
  try {
    const { ctx } = fakeCtx({ deepseekAccount: fakeAccount(READY) });
    apply(ctx, { cacheDir: dir, intervalMs: 60_000 });
    assert.equal(existsSync(join(dir, 'apply-started.json')), true);
    const marker = read(dir, 'apply-started.json');
    assert.equal(marker.dir, dir);
    assert.equal(marker.intervalMs, 60_000);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('没有账号服务时写 no-service，不抛错', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bridge-nosvc-'));
  try {
    const { ctx } = fakeCtx({});
    apply(ctx, { cacheDir: dir, intervalMs: 60_000 });
    await new Promise((r) => setTimeout(r, 1_300));
    assert.equal(read(dir, 'account.json').status, 'no-service');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('有账号服务时，第一次 tick 就落下余额', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bridge-live-'));
  try {
    const { ctx } = fakeCtx({ deepseekAccount: fakeAccount(READY) });
    apply(ctx, { cacheDir: dir, intervalMs: 60_000 });
    await new Promise((r) => setTimeout(r, 1_500));
    const account = read(dir, 'account.json');
    assert.equal(account.status, 'ready');
    assert.equal(account.wallets[0].balance, '12.34');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('dispose 之后不再写盘', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bridge-stop-'));
  try {
    const { ctx, disposed } = fakeCtx({ deepseekAccount: fakeAccount(READY) });
    apply(ctx, { cacheDir: dir, intervalMs: 60_000 });
    assert.equal(disposed.length, 1);
    assert.equal(disposed[0].event, 'dispose');
    disposed[0].listener();
    const before = read(dir, 'apply-started.json').at;
    await new Promise((r) => setTimeout(r, 1_300));
    assert.equal(read(dir, 'apply-started.json').at, before);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('DSH_HOME 决定默认目录', () => {
  assert.equal(defaultDir({ DSH_HOME: 'C:\\x\\.dsh' }), join('C:\\x\\.dsh', 'storages', 'coopanion-bridge'));
});
