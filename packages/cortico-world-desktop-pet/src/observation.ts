/** One random delay follows each completed or skipped observation. */
export interface ObservationSchedule {
  enabled: boolean;
  minIntervalSeconds: number;
  maxIntervalSeconds: number;
}

export interface RandomObservationClockOptions {
  canObserve(): boolean;
  captureAndNotify(signal: AbortSignal): Promise<void>;
  random?: () => number;
  onError?: (error: unknown) => void;
}

export class RandomObservationClock {
  private config: ObservationSchedule = { enabled: false, minIntervalSeconds: 300, maxIntervalSeconds: 900 };
  private running = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private active: AbortController | null = null;

  constructor(private readonly options: RandomObservationClockOptions) {}

  configure(config: ObservationSchedule): void {
    const valid = Number.isInteger(config.minIntervalSeconds) && Number.isInteger(config.maxIntervalSeconds)
      && config.minIntervalSeconds >= 30 && config.maxIntervalSeconds <= 86_400
      && config.minIntervalSeconds <= config.maxIntervalSeconds;
    const next = { ...config, enabled: config.enabled && valid };
    if (JSON.stringify(next) === JSON.stringify(this.config)) return;
    this.config = next;
    this.clearTimer();
    this.active?.abort();
    this.schedule();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.schedule();
  }

  stop(): void {
    this.running = false;
    this.clearTimer();
    this.active?.abort();
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(): void {
    if (!this.running || !this.config.enabled || this.timer || this.active) return;
    const { minIntervalSeconds: min, maxIntervalSeconds: max } = this.config;
    const random = this.options.random?.() ?? Math.random();
    const delay = (min + Math.max(0, Math.min(1, random)) * (max - min)) * 1000;
    this.timer = setTimeout(() => { this.timer = null; void this.tick(); }, delay);
  }

  private async tick(): Promise<void> {
    if (!this.running || !this.config.enabled) return;
    const controller = new AbortController();
    this.active = controller;
    try {
      if (this.options.canObserve()) await this.options.captureAndNotify(controller.signal);
    } catch (error) {
      if (!controller.signal.aborted) this.options.onError?.(error);
    } finally {
      if (this.active === controller) this.active = null;
      this.schedule();
    }
  }
}
