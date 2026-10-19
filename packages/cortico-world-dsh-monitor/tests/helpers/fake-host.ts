/** World 测试共用的假宿主：记录推送的事件，其余宿主接口都是空实现。 */
import type { EventEnvelope, PushOptions, WorldHost } from 'cortico/core/types.ts';

export class FakeHost implements WorldHost {
  events: EventEnvelope[] = [];
  pushOpts: Array<PushOptions | undefined> = [];
  deferred: Array<{ type: string; trigger?: string }> = [];
  store = {
    get: () => undefined,
    latestCursor: () => 0,
    range: () => [],
    around: () => [],
    grep: () => [],
  } as unknown as WorldHost['store'];
  blob = (): null => null;
  modelFacts = { model: () => 'test', accepts: () => false, contextWindow: () => 1_000_000 };
  log = {
    child() { return this; },
    info() {}, warn() {}, error() {}, debug() {}, trace() {}, emit() {},
  } as unknown as WorldHost['log'];

  async pushEvent(e: Omit<EventEnvelope, 'cursor'>, opts?: PushOptions): Promise<EventEnvelope> {
    const full = { ...e, cursor: this.events.length + 1 } as EventEnvelope;
    this.events.push(full);
    this.pushOpts.push(opts);
    return full;
  }

  pushDeferred(e: { type: string }, opts?: { trigger?: string }): void {
    this.deferred.push({ type: e.type, trigger: opts?.trigger });
  }

  async drainPendingEvents(): Promise<EventEnvelope[]> { return []; }

  reportUsage(): void {}
}
