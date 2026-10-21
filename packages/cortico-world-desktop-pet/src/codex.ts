/** Codex snapshots and reminder text shared by the account card and progress clock. */
import type { Language } from 'cortico/core/language.ts';
import { CodexSource, CodexAccountClient, type CodexAccountSnapshot, type CodexSnapshot, type CodexMilestone, type CodexRateLimitSnapshot } from 'cortico-world-codex-monitor';
import { codexText } from './i18n/codex.ts';
import type { DesktopPetConfigSection } from './config.ts';

export type CodexConfig = DesktopPetConfigSection['codex'];
export interface CodexView { local: CodexSnapshot | null; account: CodexAccountSnapshot | null }

export class PetCodexMonitor {
  private key = '';
  private source: CodexSource | null = null;
  private client: CodexAccountClient | null = null;
  private scanning: Promise<CodexSnapshot> | null = null;
  private accountRead: Promise<CodexAccountSnapshot> | null = null;
  private generation = 0;
  private view: CodexView = { local: null, account: null };
  private events = new Map<string, CodexMilestone>();

  configure(config: CodexConfig, timezone: string): void {
    const key = JSON.stringify([config, timezone]);
    if (key === this.key) return;
    this.dispose();
    this.key = key;
    if (!config.enabled) return;
    this.source = new CodexSource({ home: config.home || undefined, timezone });
    this.client = new CodexAccountClient({ home: config.home || undefined, executable: config.executable || undefined, cacheMs: Math.max(300, config.accountRefreshSeconds) * 1000 });
  }

  current(): CodexView { return this.view; }

  async scan(): Promise<CodexSnapshot | null> {
    if (!this.source) return null;
    if (this.scanning) return this.scanning;
    const generation = this.generation;
    const pending = this.source.scan();
    this.scanning = pending;
    try {
      const snapshot = await pending;
      if (generation !== this.generation) return null;
      this.view.local = snapshot;
      for (const event of snapshot.milestones) this.events.set(event.id, event);
      while (this.events.size > 100) this.events.delete(this.events.keys().next().value!);
      return snapshot;
    } finally {
      if (this.scanning === pending) this.scanning = null;
    }
  }

  takeMilestones(): CodexMilestone[] {
    const events = [...this.events.values()];
    this.events.clear();
    return events;
  }

  async refreshAccount(): Promise<CodexAccountSnapshot | null> {
    if (!this.client) return null;
    if (this.accountRead) return this.accountRead;
    const generation = this.generation;
    const pending = this.client.read();
    this.accountRead = pending;
    try {
      const account = await pending;
      if (generation !== this.generation) return null;
      this.view.account = account;
      return account;
    } finally {
      if (this.accountRead === pending) this.accountRead = null;
    }
  }

  dispose(): void {
    this.generation++;
    this.client?.dispose();
    this.client = null;
    this.source = null;
    this.scanning = null;
    this.accountRead = null;
    this.view = { local: null, account: null };
    this.events.clear();
    this.key = '';
  }
}

/** Each quota bucket uses its newest observed snapshot. */
export function codexLimits(view: CodexView): CodexRateLimitSnapshot[] {
  const byId = new Map<string, CodexRateLimitSnapshot>();
  for (const limit of [...(view.local?.rateLimits ?? []), ...(view.account?.rateLimits ?? [])]) {
    const old = byId.get(limit.limitId);
    if (!old || limit.observedAt >= old.observedAt) byId.set(limit.limitId, limit);
  }
  return [...byId.values()];
}

export function codexAccountLines(view: CodexView, language: Language, human: (n: number) => string, full: boolean, now = Date.now(), timezone?: string): string[] {
  const t = codexText(language).account;
  const lines = [t.title];
  const time = (ms: number) => new Date(ms).toLocaleString(language, { timeZone: timezone });
  const usage = view.account?.usage as { summary?: { lifetimeTokens?: unknown }; dailyUsageBuckets?: Array<{ startDate?: unknown; tokens?: unknown }> } | undefined;
  if (usage && typeof usage === 'object') {
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    const today = Array.isArray(usage.dailyUsageBuckets) ? usage.dailyUsageBuckets.find(bucket => bucket?.startDate === date) : undefined;
    if (typeof today?.tokens === 'number' && Number.isFinite(today.tokens) && today.tokens >= 0) lines.push(t.accountTodayTokens(human(today.tokens)));
    if (full && typeof usage.summary?.lifetimeTokens === 'number' && Number.isFinite(usage.summary.lifetimeTokens) && usage.summary.lifetimeTokens >= 0) lines.push(t.accountTokens(human(usage.summary.lifetimeTokens)));
  }
  const local = view.local;
  if (local?.available) {
    lines.push(t.todayTokens(human(local.usage.todayTokens)));
    if (full) lines.push(t.localTokens(human(local.usage.totalTokens)));
    if (full || local.usage.partial) lines.push(t.limitedCoverage);
    if (local.usage.partial) lines.push(t.partialCoverage);
  } else lines.push(t.localMissing);
  const limits = codexLimits(view);
  for (const limit of limits) {
    for (const window of [limit.primary, limit.secondary]) {
      if (!window) continue;
      const label = [limit.limitName || limit.limitId, window.windowMinutes === undefined ? '' : t.window(window.windowMinutes)].filter(Boolean).join(' · ');
      lines.push(t.quota(label, window.usedPercent, Math.max(0, 100 - window.usedPercent)));
      if (full && window.resetsAt) lines.push(t.reset(time(window.resetsAt)));
    }
    if (full) {
      if (limit.planType) lines.push(t.plan(limit.planType));
      if (limit.credits?.balance !== undefined) lines.push(t.credits(limit.credits.balance));
      lines.push(limit.source === 'log' ? t.sourceLocal : t.sourceAccount);
      lines.push(t.updated(time(limit.observedAt)));
    }
    if (now - limit.observedAt > 10 * 60_000 || [limit.primary, limit.secondary].some(w => w?.resetsAt !== undefined && w.resetsAt <= now)) lines.push(t.stale);
  }
  if (!limits.length) lines.push(t.missing);
  if (view.account?.stale && (limits.length || view.account.usage)) lines.push(t.stale);
  if (full && view.account?.error) lines.push(t.failed(view.account.error));
  return [...new Set(lines)];
}

export function codexMilestoneLine(event: CodexMilestone, snapshot: CodexSnapshot, language: Language): string {
  const t = codexText(language).progress;
  const session = snapshot.sessions.find(s => s.id === event.sessionId);
  const title = session?.title || event.sessionId;
  const done = session?.plan.filter(step => step.status === 'completed').length ?? 0;
  const total = session?.plan.length ?? 0;
  switch (event.kind) {
    case 'turn_complete': return t.completed(title);
    case 'agent_complete': return t.subagent(title, 'completed');
    case 'failed': return t.failed(title);
    case 'blocked': return t.blocked(title);
    case 'approval': return t.approval(title);
    case 'interrupted': return t.interrupted(title);
    case 'goal_complete': return t.goal(title, 'complete');
    case 'plan_updated': return t.plan(title, done, total, event.detail ?? '');
    case 'step_complete': return t.todo(title, done, total, event.detail ?? '');
  }
}
