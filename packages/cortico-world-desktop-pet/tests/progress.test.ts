/** src/progress.ts: the task progress bubble's lines, and the progress text both languages carry. */
import { describe, expect, it } from 'vitest';
import { LANGUAGES } from 'cortico/core/language.ts';
import type { Completion, Milestone, MilestoneKind } from 'cortico-world-dsh-monitor';
import { formatCompletion, formatMilestones, milestoneLine, type ProgressText } from '../src/progress.ts';
import { desktopPetConfigGroups } from '../src/config.ts';
import zh from '../src/i18n/zh.ts';
import en from '../src/i18n/en.ts';

// both tables must be a ProgressText: the type says so here, the test below checks the keys at run time
const text: ProgressText = zh.progress;
const english: ProgressText = en.progress;

let seq = 0;
const milestone = (kind: MilestoneKind, data: Record<string, unknown>, session = '整理'): Milestone =>
  ({ key: `m${seq++}`, kind, sessionId: 's1', session, data });
const completion = (patch: Partial<Completion> = {}): Completion => ({
  key: `c${seq++}`, sessionId: 's1', session: '整理', turns: 3, tokens: 12_000, goalCompleted: false, objective: '', data: {}, ...patch,
});
const human = (n: number) => `${n} tokens`;

describe('milestoneLine', () => {
  it('says each kind of milestone in its own words', () => {
    expect(milestoneLine(milestone('subagent-done', { label: '查日志', turns: 2, tokens: 900 }), text)).toBe('子代理「查日志」做完了子任务');
    expect(milestoneLine(milestone('turn-done', { turns: 4, tokens: 9000, steps: 12 }), text)).toBe('「整理」第 4 轮做完了');
    expect(milestoneLine(milestone('todo-done', { completed: 2, total: 5, latest: '写测试' }), text)).toBe('「整理」完成待办：写测试（2/5）');
    expect(milestoneLine(milestone('goal-phase', { from: 'running', to: 'complete', objective: '做完进度气泡' }), text)).toBe('「整理」的目标状态变成 complete');
  });

  it('falls back to the turn when a subagent has no label, as the detector gives when the parent is gone', () => {
    expect(milestoneLine(milestone('subagent-done', { label: '', turns: 2 }), text)).toBe('「整理」第 2 轮做完了');
    expect(milestoneLine(milestone('subagent-done', {}), text)).toBe('「整理」第 0 轮做完了');
  });

  it('says the count alone when the to-do that finished has no text', () => {
    expect(milestoneLine(milestone('todo-done', { completed: 1, total: 3 }), text)).toBe('「整理」待办完成 1/3');
  });
});

describe('formatMilestones', () => {
  const turns = (count: number) => Array.from({ length: count }, (_, i) => milestone('turn-done', { turns: i + 1 }));

  it('says nothing when there is nothing to say', () => {
    expect(formatMilestones([], text)).toBe('');
  });

  it('says one milestone on one line', () => {
    expect(formatMilestones(turns(1), text)).toBe('「整理」第 1 轮做完了');
  });

  it('says three milestones as three lines, with no tail', () => {
    expect(formatMilestones(turns(3), text)).toBe(['「整理」第 1 轮做完了', '「整理」第 2 轮做完了', '「整理」第 3 轮做完了'].join('\n'));
  });

  it('keeps five to maxLines and folds the rest into more(n)', () => {
    const five = turns(5);
    expect(formatMilestones(five, text)).toBe(['「整理」第 1 轮做完了', '「整理」第 2 轮做完了', '「整理」第 3 轮做完了', '…还有 2 项'].join('\n'));
    expect(formatMilestones(five, text, 1)).toBe(['「整理」第 1 轮做完了', '…还有 4 项'].join('\n'));
    expect(formatMilestones(five, text, 2)).toBe(['「整理」第 1 轮做完了', '「整理」第 2 轮做完了', '…还有 3 项'].join('\n'));
  });

  it('says all five when maxLines allows them', () => {
    expect(formatMilestones(turns(5), text, 5)).toBe(turns(5).map((_, i) => `「整理」第 ${i + 1} 轮做完了`).join('\n'));
  });
});

describe('formatCompletion', () => {
  it('reports the turns, the usage and the goal', () => {
    expect(formatCompletion(completion({ turns: 3, goalCompleted: true, objective: '做完进度气泡' }), text, human))
      .toBe(['「整理」做完了', '3 轮 · 12000 tokens', '目标：做完进度气泡'].join('\n'));
  });

  it('says there was no goal when none was set', () => {
    expect(formatCompletion(completion({ turns: 1, tokens: 500 }), text, human))
      .toBe(['「整理」做完了', '1 轮 · 500 tokens', '没有设目标'].join('\n'));
  });

  it('says there was no goal when the goal is done but its text is empty', () => {
    expect(formatCompletion(completion({ goalCompleted: true, objective: '' }), text, human).split('\n')[2]).toBe('没有设目标');
  });
});

describe('the progress text of a language', () => {
  const keys: ReadonlyArray<keyof ProgressText> = [
    'subagentDone', 'turnDone', 'todoDone', 'goalMoved', 'more', 'completedTitle', 'completedLine', 'completedGoal', 'nothingGoal',
  ];

  it('has every key in zh and in en, and the same keys in both', () => {
    expect(Object.keys(en.progress).sort()).toEqual(Object.keys(zh.progress).sort());
    for (const [language, table] of [['zh', zh.progress], ['en', en.progress]] as const) {
      for (const key of keys) expect(typeof table[key], `${language}.${key}`).toBe(key === 'nothingGoal' ? 'string' : 'function');
    }
  });

  it('says the same things in English', () => {
    expect(milestoneLine(milestone('turn-done', { turns: 4 }), english)).toBe('"整理" finished turn 4');
    expect(formatCompletion(completion(), english, human).split('\n')).toEqual(['"整理" is done', '3 turns · 12000 tokens', 'No goal was set']);
  });
});

describe('the progress settings in the console', () => {
  // 别的语言的文字表没有 progress 这一组，整组读 en / zh；这里盯住它别在别的语言下缺键
  const keys = ['enabled', 'intervalSeconds', 'coalesceSeconds', 'idleSeconds', 'reportCompletion'];

  it('have a title and a description for every key, in every language', () => {
    for (const language of LANGUAGES) {
      const group = desktopPetConfigGroups(language).find((g) => g.id === 'world:desktop-pet')!;
      for (const key of keys) {
        const property = group.schema.properties[`worlds.desktop-pet.progress.${key}`];
        expect(property?.title, `${language} ${key}`).toBeTruthy();
        expect(property?.description, `${language} ${key}`).toBeTruthy();
        expect(property?.['x-hot'], `${language} ${key}`).toBe(true);
      }
    }
  });
});
