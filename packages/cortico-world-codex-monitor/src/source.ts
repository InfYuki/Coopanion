import { readdir, stat, open, access } from 'node:fs/promises';
import { join, basename, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { milestone, visibleMilestones } from './milestones.ts';
import { resolveCodexHome } from './paths.ts';
import type { CodexSourceOptions, CodexSession, CodexSnapshot, CodexMilestone, CodexRateLimitSnapshot, CodexRateLimitWindow } from './types.ts';

type RecordValue = Record<string, any>;
interface FileState {
  offset: number;
  session: CodexSession;
  totals: Map<string, number>;
  calls: Map<string, { name: string; approval: boolean }>;
  partial: boolean;
  ino: number;
  statusAt: number;
  rawTokens?: number;
  metaSeen: boolean;
  historyStart?: number;
  skipFirstLine: boolean;
  rates: Map<string, CodexRateLimitSnapshot>;
}
interface FileInfo { path: string; size: number; mtimeMs: number; ino: number }
function object(value: unknown): RecordValue { return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {}; }
function numeric(value: unknown): number | undefined { return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined; }
function text(value: unknown, limit = 160): string { return typeof value === 'string' ? value.slice(0, limit) : ''; }
function parse(value: unknown): RecordValue {
  if (typeof value !== 'string') return object(value);
  try { return object(JSON.parse(value)); } catch { return {}; }
}

/** Local rollouts are append-only JSONL. Only explicit lifecycle records settle a turn. */
export class CodexSource {
  readonly home: string;
  private readonly options: Required<Pick<CodexSourceOptions, 'maxFiles' | 'maxReadBytes' | 'maxScanBytes'>>;
  private readonly date: Intl.DateTimeFormat;
  private readonly files = new Map<string, FileState>();
  private initialized = false;
  private startedAt = 0;
  private readonly seenMilestones = new Set<string>();

  constructor(options: CodexSourceOptions = {}) {
    this.home = resolveCodexHome(options.home);
    this.options = {
      maxFiles: Math.max(1, options.maxFiles ?? 100),
      maxReadBytes: Math.max(256, options.maxReadBytes ?? 2 * 1024 * 1024),
      maxScanBytes: Math.max(256, options.maxScanBytes ?? 16 * 1024 * 1024),
    };
    this.date = new Intl.DateTimeFormat('en-CA', { timeZone: options.timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
  }

  async scan(now = Date.now()): Promise<CodexSnapshot> {
    if (!this.startedAt) this.startedAt = now;
    const events: CodexMilestone[] = [];
    const warnings: string[] = [];
    const found: FileInfo[] = [];
    let available = false;
    let incompleteDiscovery = false;
    const walk = async (directory: string): Promise<void> => {
      let entries;
      try { entries = await readdir(directory, { withFileTypes: true }); available = true; }
      catch {
        incompleteDiscovery = true;
        warnings.push('session_directory_unreadable');
        return;
      }
      for (const entry of entries) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) await walk(path);
        else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
          try { const info = await stat(path); found.push({ path, size: info.size, mtimeMs: info.mtimeMs, ino: info.ino }); }
          catch { incompleteDiscovery = true; warnings.push('rollout_unreadable'); }
        }
      }
    };
    await walk(join(this.home, 'sessions'));
    found.sort((a, b) => b.mtimeMs - a.mtimeMs || a.path.localeCompare(b.path));
    const selected = found.slice(0, this.options.maxFiles);
    const selectedPaths = new Set(selected.map(file => file.path));
    for (const path of this.files.keys()) if (!selectedPaths.has(path)) this.files.delete(path);
    let partial = incompleteDiscovery || found.length > selected.length;
    let remaining = this.options.maxScanBytes;
    for (const file of selected) {
      if (remaining <= 0) { partial = true; continue; }
      let state = this.files.get(file.path);
      if (!state || file.size < state.offset || state.ino !== file.ino) {
        const id = basename(file.path).match(/[0-9a-f]{8}-[0-9a-f-]{27,}/i)?.[0] ?? basename(file.path, '.jsonl');
        const start = Math.max(0, file.size - Math.min(this.options.maxReadBytes, remaining));
        state = { offset: start, session: { id, title: `Codex ${id.slice(0, 8)}`, cwd: '', status: 'unknown', updatedAt: file.mtimeMs, totalTokens: 0, todayTokens: 0, plan: [] }, totals: new Map(), calls: new Map(), partial: start > 0, ino: file.ino, statusAt: 0, metaSeen: false, skipFirstLine: start > 0, rates: new Map() };
        this.files.set(file.path, state);
        if (start > 0) {
          const header = await open(file.path, 'r').catch(() => null);
          if (header) {
            try {
              const bytes = Buffer.alloc(Math.min(64 * 1024, remaining, file.size));
              const { bytesRead } = await header.read(bytes, 0, bytes.length, 0);
              remaining -= bytesRead;
              const end = bytes.subarray(0, bytesRead).indexOf(10);
              if (end >= 0) {
                try {
                  const record = JSON.parse(bytes.subarray(0, end).toString('utf8'));
                  if (record.type === 'session_meta') this.apply(state, record, [], 'header');
                } catch { /* Filename identity and partial coverage remain available. */ }
              }
            } finally { await header.close(); }
          }
        }
      }
      if (remaining <= 0) { partial = true; continue; }
      const length = Math.min(file.size - state.offset, this.options.maxReadBytes, remaining);
      if (length > 0) {
        const handle = await open(file.path, 'r').catch(() => null);
        if (!handle) { warnings.push('rollout_unreadable'); partial = true; continue; }
        try {
          const bytes = Buffer.alloc(length);
          const { bytesRead } = await handle.read(bytes, 0, length, state.offset);
          remaining -= bytesRead;
          const end = bytes.subarray(0, bytesRead).lastIndexOf(10);
          if (end >= 0) {
            const start = state.offset;
            let consumed = 0;
            for (const line of bytes.subarray(0, end + 1).toString('utf8').split('\n')) {
              if (state.skipFirstLine) state.skipFirstLine = false;
              else if (line) {
                try { this.apply(state, JSON.parse(line), events, `${start + consumed}`); } catch { state.partial = true; }
              }
              consumed += Buffer.byteLength(line, 'utf8') + 1;
            }
            state.offset += end + 1;
          } else if (bytesRead === length && file.size - state.offset > bytesRead) {
            // Oversized records may contain message bodies; resume after them without retaining their contents.
            state.offset += bytesRead;
            state.partial = true;
            state.skipFirstLine = true;
          }
        } finally { await handle.close(); }
      }
      partial ||= state.partial || state.offset < file.size;
    }
    await this.metadata(events, warnings);
    const today = this.date.format(now);
    const sessions = [...this.files.values()].map(state => {
      state.session.todayTokens = state.totals.get(today) ?? 0;
      return { ...state.session, plan: state.session.plan.map(step => ({ ...step })), ...(state.session.goal ? { goal: { ...state.session.goal } } : {}) };
    }).sort((a, b) => b.updatedAt - a.updatedAt);
    const byId = new Map(sessions.map(session => [session.id, session]));
    const unseen = events.filter(event => {
      if (this.seenMilestones.has(event.id)) return false;
      this.seenMilestones.add(event.id);
      if (this.seenMilestones.size > 4096) this.seenMilestones.delete(this.seenMilestones.values().next().value!);
      return true;
    });
    const milestones = visibleMilestones(unseen, this.initialized, this.startedAt).map(event => {
      const session = byId.get(event.sessionId);
      return event.kind === 'turn_complete' && (session?.parentId || session?.agentPath) ? { ...event, kind: 'agent_complete' as const } : event;
    });
    const rates = new Map<string, CodexRateLimitSnapshot>();
    for (const state of this.files.values()) for (const rate of state.rates.values()) {
      if ((rates.get(rate.limitId)?.observedAt ?? 0) <= rate.observedAt) rates.set(rate.limitId, rate);
    }
    this.initialized = true;
    return {
      home: this.home, available, sessions,
      usage: { totalTokens: sessions.reduce((sum, session) => sum + session.totalTokens, 0), todayTokens: sessions.reduce((sum, session) => sum + session.todayTokens, 0), partial },
      rateLimits: [...rates.values()].map(rate => structuredClone(rate)), milestones,
      warnings: [...new Set(warnings)],
    };
  }

  private apply(state: FileState, record: RecordValue, events: CodexMilestone[], ordinal: string): void {
    const payload = object(record.payload);
    const timestamp = Date.parse(record.timestamp);
    if (!Number.isFinite(timestamp)) return;
    const session = state.session;
    if (record.type !== 'session_meta' && state.historyStart !== undefined && numeric(record.ordinal) !== undefined && record.ordinal <= state.historyStart) return;
    session.updatedAt = Math.max(session.updatedAt, timestamp);
    const emit = (kind: CodexMilestone['kind'], detail?: string) => events.push(milestone(session.id, kind, timestamp, ordinal, detail));
    const status = (value: CodexSession['status']) => { if (timestamp >= state.statusAt) { session.status = value; state.statusAt = timestamp; } };
    if (record.type === 'session_meta') {
      if (state.metaSeen) return;
      const metaId = text(payload.id || payload.session_id, 128);
      if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(session.id) && metaId && metaId !== session.id) return;
      state.metaSeen = true;
      session.id = text(payload.id || payload.session_id, 128) || session.id;
      session.cwd = text(payload.cwd, 2048);
      const spawn = object(object(object(payload.source).subagent).thread_spawn);
      session.parentId = text(payload.parent_thread_id || spawn.parent_thread_id, 128) || undefined;
      session.agentPath = text(payload.agent_path || spawn.agent_path, 256) || undefined;
      if (payload.forked_from_id) {
        state.historyStart = numeric(payload.subagent_history_start_ordinal);
        if (state.historyStart === undefined) state.partial = true;
      }
    }
    if (record.type === 'token_usage_record' && (!payload.thread_id || payload.thread_id === session.id)) this.tokens(state, object(payload.thread_token_usage), timestamp, object(payload.usage));
    if (record.type === 'event_msg') {
      switch (payload.type) {
        case 'task_started': case 'turn_started': status('running'); break;
        case 'task_complete': case 'turn_complete': case 'turn_completed':
          status(session.goal?.status === 'complete' ? 'completed' : ['blocked', 'usage_limited', 'budget_limited'].includes(session.goal?.status ?? '') ? 'blocked' : 'idle');
          emit(session.parentId || session.agentPath ? 'agent_complete' : 'turn_complete'); break;
        case 'turn_aborted': status('interrupted'); emit('interrupted'); break;
        case 'task_failed': case 'turn_failed': status('failed'); emit('failed'); break;
        case 'approval_requested': case 'request_approval': case 'exec_approval_request': case 'apply_patch_approval_request':
          status('waiting_approval'); emit('approval'); break;
        case 'token_count': {
          const info = object(payload.info);
          this.tokens(state, object(info.total_token_usage), timestamp, object(info.last_token_usage));
          this.rateLimits(state, payload.rate_limits, timestamp);
          break;
        }
        case 'goal_updated': case 'goal_status_changed': this.goal(state, object(payload.goal ?? payload), timestamp, events, ordinal); break;
      }
    }
    if (record.type !== 'response_item') return;
    const name = text(payload.name, 256).split(/[./]/).pop() ?? '';
    if (payload.type === 'function_call' || payload.type === 'custom_tool_call') {
      const args = parse(payload.arguments ?? payload.input);
      const approval = args.sandbox_permissions === 'require_escalated' || /request_user_input/.test(name);
      if (payload.call_id) {
        state.calls.set(payload.call_id, { name, approval });
        if (state.calls.size > 256) state.calls.delete(state.calls.keys().next().value!);
      }
      if (approval) { status('waiting_approval'); emit('approval'); }
      if (name === 'update_plan' && Array.isArray(args.plan)) {
        const previous = session.plan;
        const plan = args.plan.filter((step: unknown) => typeof object(step).step === 'string' && typeof object(step).status === 'string')
          .slice(0, 100).map((step: RecordValue) => ({ step: text(step.step, 240), status: text(step.status, 32) }));
        if (JSON.stringify(previous) !== JSON.stringify(plan)) {
          session.plan = plan;
          emit(plan.some((step: { step: string; status: string }) => step.status === 'completed' && previous.some(old => old.step === step.step && old.status !== 'completed')) ? 'step_complete' : 'plan_updated');
        }
      }
      // Goal tool arguments express intent; only successful output or the goals database confirms status.
    }
    if (payload.type === 'function_call_output' || payload.type === 'custom_tool_call_output') {
      const call = state.calls.get(payload.call_id);
      state.calls.delete(payload.call_id);
      if (call?.approval && session.status === 'waiting_approval') status('running');
      if (call && /^(create_goal|update_goal|get_goal)$/.test(call.name)) {
        const output = parse(payload.output);
        if (!output.error && Object.keys(output).length) this.goal(state, object(output.goal ?? output), timestamp, events, ordinal);
      }
    }
  }

  private tokens(state: FileState, usage: RecordValue, timestamp: number, last: RecordValue): void {
    const total = numeric(usage.total_tokens);
    if (total === undefined) return;
    const previous = state.rawTokens;
    const reset = previous !== undefined && total < previous;
    const delta = previous === undefined ? state.partial ? numeric(last.total_tokens) ?? 0 : total : reset ? numeric(last.total_tokens) ?? total : total - previous;
    if (reset) state.partial = true;
    state.rawTokens = total;
    state.session.totalTokens = previous === undefined ? total : state.session.totalTokens + delta;
    const day = this.date.format(timestamp);
    state.totals.set(day, (state.totals.get(day) ?? 0) + delta);
  }

  private rateLimits(state: FileState, value: unknown, timestamp: number): void {
    const rate = object(value);
    if (!Object.keys(rate).length) return;
    const limitId = text(rate.limit_id, 128) || 'codex';
    if ((state.rates.get(limitId)?.observedAt ?? 0) > timestamp) return;
    const window = (value: unknown): CodexRateLimitWindow | undefined => {
      const item = object(value); const usedPercent = numeric(item.used_percent);
      if (usedPercent === undefined || usedPercent > 100) return undefined;
      return { usedPercent, windowMinutes: numeric(item.window_minutes), resetsAt: numeric(item.resets_at) === undefined ? undefined : item.resets_at * 1000 };
    };
    const credits = object(rate.credits);
    state.rates.set(limitId, {
      limitId, limitName: text(rate.limit_name) || undefined,
      primary: window(rate.primary), secondary: window(rate.secondary),
      credits: typeof credits.has_credits === 'boolean' && typeof credits.unlimited === 'boolean' ? { hasCredits: credits.has_credits, unlimited: credits.unlimited, balance: text(credits.balance, 80) || undefined } : undefined,
      planType: text(rate.plan_type, 80) || undefined, observedAt: timestamp, source: 'log',
    });
  }

  private goal(state: FileState, value: RecordValue, timestamp: number, events: CodexMilestone[], ordinal: string): void {
    if (!['active', 'paused', 'blocked', 'usage_limited', 'budget_limited', 'complete'].includes(value.status)) return;
    const before = state.session.goal;
    const next = { id: text(value.goal_id ?? value.id, 128) || undefined, status: value.status, tokensUsed: numeric(value.tokens_used), tokenBudget: numeric(value.token_budget) };
    state.session.goal = next;
    if (timestamp >= state.statusAt && (next.status === 'complete' || ['blocked', 'usage_limited', 'budget_limited'].includes(next.status))) {
      state.session.status = next.status === 'complete' ? 'completed' : 'blocked';
      state.statusAt = timestamp;
    }
    if (before?.status === next.status && before?.id === next.id) return;
    if (next.status === 'complete' || next.status === 'blocked' || next.status === 'usage_limited' || next.status === 'budget_limited') {
      events.push(milestone(state.session.id, next.status === 'complete' ? 'goal_complete' : 'blocked', timestamp, ordinal));
    }
  }

  private async metadata(events: CodexMilestone[], warnings: string[]): Promise<void> {
    const states = new Map([...this.files.values()].map(state => [state.session.id, state]));
    if (!states.size) return;
    const dbPaths = ['state_5.sqlite', 'goals_1.sqlite'];
    for (const name of dbPaths) {
      const path = resolve(this.home, name);
      try { await access(path); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') warnings.push('metadata_unavailable');
        continue;
      }
      try {
        const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
        const db = new DatabaseSync(path, { readOnly: true });
        try {
          if (name.startsWith('state_')) {
            const query = db.prepare('SELECT id,title,cwd,agent_path FROM threads WHERE id = ?');
            for (const [id, state] of states) {
              const row = query.get(id) as RecordValue | undefined;
              if (row) {
                state.session.title = text(row.title, 160) || state.session.title;
                state.session.cwd = text(row.cwd, 2048) || state.session.cwd;
                state.session.agentPath = text(row.agent_path, 256) || state.session.agentPath;
              }
            }
          } else {
            const query = db.prepare('SELECT goal_id,status,tokens_used,token_budget,updated_at_ms FROM thread_goals WHERE thread_id = ?');
            for (const [id, state] of states) {
              const row = query.get(id) as RecordValue | undefined;
              if (row && numeric(row.updated_at_ms) !== undefined) this.goal(state, row, row.updated_at_ms, events, `goal:${row.goal_id}:${row.updated_at_ms}`);
            }
          }
        } finally { db.close(); }
      } catch {
        warnings.push('metadata_unavailable');
      }
    }
  }
}
