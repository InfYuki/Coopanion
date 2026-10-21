/** Codex text contracts across every supported application language. */
import { describe, expect, it } from 'vitest';
import { LANGUAGES } from 'cortico/core/language.ts';
import { codexText } from '../src/i18n/codex.ts';

function renderLeaves(value: unknown, path = ''): [string, string][] {
  if (typeof value === 'function') return [[path, String(value('Example', 2, 5, 'Step'))]];
  if (typeof value === 'string') return [[path, value]];
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([key, item]) => renderLeaves(item, `${path}.${key}`));
  throw new Error(`Unexpected text value at ${path}`);
}

describe('Codex text', () => {
  it.each(LANGUAGES)('%s supplies all translated leaves and resolves every template', language => {
    const leaves = renderLeaves(codexText(language));
    expect(leaves.map(([path]) => path)).toEqual(renderLeaves(codexText('en')).map(([path]) => path));
    for (const [path, value] of leaves) {
      expect(value.trim(), path).not.toBe('');
      expect(value, path).not.toMatch(/\{\d+\}|undefined|NaN/);
    }
    const account = codexText(language).account;
    expect(account.todayTokens('123')).not.toBe(account.accountTodayTokens('123'));
    expect(account.localTokens('456')).not.toBe(account.accountTokens('456'));
    expect(account.localMissing).not.toBe(account.missing);
    expect(account.partialCoverage).not.toBe(account.limitedCoverage);
    expect(account.quota('Window', 37, 63)).toContain('37');
    expect(account.quota('Window', 37, 63)).toContain('63');
    expect(codexText(language).progress.goal('Example', 'complete')).not.toContain('complete');
    expect(codexText(language).progress.subagent('Example', 'completed')).not.toContain('completed');
  });

  it('completion describes a turn, while goal completion names the goal', () => {
    expect(codexText('en').progress.completed('Example')).toContain('turn completed');
    expect(codexText('en').progress.completed('Example')).not.toContain('task completed');
    expect(codexText('zh').progress.completed('示例')).toContain('本轮已完成');
    expect(codexText('zh').account.partialCoverage).toContain('近似');
    expect(codexText('en').account.partialCoverage).toContain('approximate');
    expect(codexText('zh').progress.goal('示例', 'complete')).toContain('目标 已完成');
    for (const language of LANGUAGES) {
      const p = codexText(language).progress;
      expect(p.completed('Example')).not.toBe(p.goal('Example', 'complete'));
      expect(p.goal('Example', 'complete')).toBe(p.goal('Example', 'completed'));
    }
  });
});
