import { afterEach, describe, expect, it, vi } from 'vitest';
import { RandomObservationClock } from '../src/observation.ts';

afterEach(() => vi.useRealTimers());

const schedule = { enabled: true, minIntervalSeconds: 30, maxIntervalSeconds: 90 };

describe('random observation scheduling', () => {
  it('draws a new interval after every observation and waits for completion', async () => {
    vi.useFakeTimers();
    const samples = [0, 1, .5];
    const times: number[] = [];
    const started = Date.now();
    const clock = new RandomObservationClock({
      canObserve: () => true, random: () => samples.shift() ?? 0,
      captureAndNotify: async () => { times.push(Date.now() - started); await new Promise(resolve => setTimeout(resolve, 5000)); },
    });
    clock.configure(schedule); clock.start();
    await vi.advanceTimersByTimeAsync(29_999);
    expect(times).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(times).toEqual([30_000]);
    await vi.advanceTimersByTimeAsync(94_999);
    expect(times).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(times).toEqual([30_000, 125_000]);
    await vi.advanceTimersByTimeAsync(65_000);
    expect(times).toEqual([30_000, 125_000, 190_000]);
    clock.stop();
  });

  it('skips a busy sample and draws a new interval without a backlog', async () => {
    vi.useFakeTimers();
    let busy = true;
    let observations = 0;
    const samples = [0, 1, 0];
    const clock = new RandomObservationClock({ canObserve: () => !busy, random: () => samples.shift() ?? 0, captureAndNotify: async () => { observations++; } });
    clock.configure(schedule); clock.start();
    await vi.advanceTimersByTimeAsync(30_000);
    busy = false;
    await vi.advanceTimersByTimeAsync(89_999);
    expect(observations).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(observations).toBe(1);
    clock.stop();
  });

  it('disabling aborts the current capture and prevents subsequent observations', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    let finish = () => {};
    let observations = 0;
    const clock = new RandomObservationClock({ canObserve: () => true, random: () => 0, captureAndNotify: async value => {
      observations++; signal = value; await new Promise<void>(resolve => { finish = resolve; });
    } });
    clock.configure(schedule); clock.start();
    await vi.advanceTimersByTimeAsync(30_000);
    clock.configure({ ...schedule, enabled: false });
    expect(signal?.aborted).toBe(true);
    finish();
    await vi.advanceTimersByTimeAsync(500_000);
    expect(observations).toBe(1);
    clock.stop();
  });

  it('hot changes abort the old capture and wait for it before scheduling again', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    let finish = () => {};
    let observations = 0;
    const clock = new RandomObservationClock({ canObserve: () => true, random: () => 0, captureAndNotify: async value => {
      observations++; signal = value;
      if (observations === 1) await new Promise<void>(resolve => { finish = resolve; });
    } });
    clock.configure(schedule); clock.start();
    await vi.advanceTimersByTimeAsync(30_000);
    clock.configure({ ...schedule, minIntervalSeconds: 60 });
    expect(signal?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(500_000);
    expect(observations).toBe(1);
    finish();
    await vi.advanceTimersByTimeAsync(59_999);
    expect(observations).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(observations).toBe(2);
    clock.stop();
  });

  it('stop clears the timer and aborts a capture already in flight', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    let observations = 0;
    const clock = new RandomObservationClock({ canObserve: () => true, random: () => 0, captureAndNotify: async value => {
      signal = value; observations++;
      await new Promise<void>(resolve => value.addEventListener('abort', () => resolve(), { once: true }));
    } });
    clock.configure(schedule); clock.start(); clock.stop();
    await vi.advanceTimersByTimeAsync(90_000);
    expect(observations).toBe(0);
    clock.start();
    await vi.advanceTimersByTimeAsync(30_000);
    clock.stop();
    expect(signal?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(500_000);
    expect(observations).toBe(1);
  });

  it('reschedules after a failed observation without overlapping calls', async () => {
    vi.useFakeTimers();
    const errors: unknown[] = [];
    let observations = 0;
    const clock = new RandomObservationClock({ canObserve: () => true, random: () => 0, captureAndNotify: async () => { observations++; throw new Error('capture failed'); }, onError: error => errors.push(error) });
    clock.configure(schedule); clock.start();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(observations).toBe(2);
    expect(errors).toHaveLength(2);
    clock.stop();
  });

  it('invalid or disabled intervals leave no timer armed', async () => {
    vi.useFakeTimers();
    let observations = 0;
    const clock = new RandomObservationClock({ canObserve: () => true, captureAndNotify: async () => { observations++; } });
    clock.start();
    for (const config of [
      { ...schedule, enabled: false }, { ...schedule, minIntervalSeconds: 100 },
      { ...schedule, minIntervalSeconds: 0 }, { ...schedule, maxIntervalSeconds: 90_000 },
      { ...schedule, minIntervalSeconds: Number.NaN },
      { ...schedule, minIntervalSeconds: 30.5 },
    ]) {
      clock.configure(config);
      await vi.advanceTimersByTimeAsync(100_000);
    }
    expect(observations).toBe(0);
    clock.stop();
  });
});
