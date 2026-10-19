// coopanion-account-bridge — a tiny DeepSeek Harness Host plugin.
//
// Why it exists: the account balance is only reachable through the Host's own
// `deepseekAccount` service, which the Platform authenticates with the stored
// account grant. Nothing outside the Host may read that grant (and a hand-built
// request with a wrong header can make the Host drop the login), so the Host
// asks on everyone's behalf and merely publishes the answer:
//
//   ~/.dsh/storages/coopanion-bridge/account.json
//
// Coopanion reads that file. It never sees a credential, and this plugin never
// logs one: only currency strings, amounts and a status reach the disk.
//
// Written defensively on purpose: it needs no optional Host API (no logger, no
// timer service, no ctx.effect), and the first thing `apply` does is write
// `apply-started.json`. If that file is missing afterwards `apply` never ran;
// if `apply-error.json` appears instead, it says why.
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const INTERVAL_MS = 60_000;
const START_DELAY_MS = 1_000;

function text(error) {
  return error instanceof Error ? error.message : String(error);
}

/** One wallet; the amount stays a string because the Platform may send `0E-16`. */
function wallet(w) {
  return { currency: String(w?.currency ?? ''), balance: String(w?.balance ?? '') };
}

/** Ask the Host for account state, balance and profile, then return what came back. */
export async function collect(account, client) {
  let state = null;
  try {
    state = await account.getState();
  } catch (error) {
    return { status: 'error', error: text(error) };
  }
  if (!state || state.status !== 'credential-stored') return { status: 'signed-out' };

  let balance = null;
  try {
    balance = await account.getBalance(client);
  } catch (error) {
    return { status: 'error', error: text(error) };
  }
  if (balance === null) return { status: 'signed-out' };
  if (balance.status !== 'ready') return { status: 'failed' };

  let profile = null;
  try {
    profile = await account.getProfile(client);
  } catch {
    // the profile is decoration; a balance without a name is still a balance
  }
  return {
    status: 'ready',
    wallets: (balance.value ?? []).map(wallet),
    bonusWallets: (balance.bonusWallets ?? []).map(wallet),
    profile: profile && profile.status === 'ready'
      ? { id: profile.value.id ?? null, name: profile.value.name ?? null }
      : null,
  };
}

/** Write atomically: a reader must never see half a file. */
export function writeJson(dir, name, payload) {
  const record = { at: Date.now(), ...payload };
  try {
    mkdirSync(dir, { recursive: true });
    const target = join(dir, name);
    const temporary = `${target}.tmp`;
    writeFileSync(temporary, JSON.stringify(record, null, 2), 'utf8');
    renameSync(temporary, target);
  } catch {
    // nothing else to do: the next tick tries again
  }
  return record;
}

/** `$DSH_HOME/storages/coopanion-bridge`, beside the session projection cache. */
export function defaultDir(env = process.env) {
  const home = env.DSH_HOME?.trim();
  return join(home || join(homedir(), '.dsh'), 'storages', 'coopanion-bridge');
}

export const name = 'coopanion-account-bridge';

/**
 * No `inject`: the service is looked up at use time instead, so a Host without an
 * account platform still loads this plugin and simply publishes `no-service`.
 */
export function apply(ctx, config = {}) {
  const dir = config?.cacheDir || defaultDir();
  const every = Number(config?.intervalMs) > 0 ? Number(config.intervalMs) : INTERVAL_MS;
  const client = {
    version: String(config?.client?.version ?? '1.0.0'),
    locale: String(config?.client?.locale ?? 'zh-CN'),
    timezoneOffsetSeconds: Number(config?.client?.timezoneOffsetSeconds ?? -new Date().getTimezoneOffset() * 60),
  };

  // proof that apply ran at all: written before anything that could throw
  writeJson(dir, 'apply-started.json', { pid: process.pid, dir, intervalMs: every });

  let stopped = false;
  const accountOf = () => (typeof ctx?.get === 'function' ? ctx.get('deepseekAccount') : ctx?.deepseekAccount);

  const tick = async () => {
    if (stopped) return null;
    try {
      const account = accountOf();
      if (!account) {
        writeJson(dir, 'account.json', { status: 'no-service' });
        return null;
      }
      const result = await collect(account, client);
      writeJson(dir, 'account.json', result);
      return result;
    } catch (error) {
      writeJson(dir, 'apply-error.json', { error: text(error) });
      return null;
    }
  };

  try {
    const first = setTimeout(() => { void tick(); }, START_DELAY_MS);
    const repeat = setInterval(() => { void tick(); }, every);
    first?.unref?.();
    repeat?.unref?.();
    if (typeof ctx?.on === 'function') {
      ctx.on('dispose', () => {
        stopped = true;
        clearTimeout(first);
        clearInterval(repeat);
      });
    }
  } catch (error) {
    writeJson(dir, 'apply-error.json', { error: text(error) });
  }
}
