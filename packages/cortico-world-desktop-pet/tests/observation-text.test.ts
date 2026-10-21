import { describe, expect, it } from 'vitest';
import { observationText } from '../src/i18n/observation.ts';
import { DESKTOP_PET_DEFAULTS, desktopPetConfigGroups, validObservationInterval } from '../src/config.ts';
import type { Language } from 'cortico/core/language.ts';

const languages: Language[] = ['zh', 'zh-Hant', 'en', 'ja', 'ko', 'fr', 'de', 'es-419', 'pt-BR', 'it', 'ru'];
describe('screen observation settings', () => {
  it.each(languages)('has complete setting text in %s', language => {
    const copy = observationText(language).config;
    for (const value of [copy.group, copy.enabled.title, copy.enabled.description, copy.min.title, copy.max.title, copy.help, copy.intervalHelp, copy.intervalError, copy.seconds]) {
      expect(value.trim().length).toBeGreaterThan(0);
      expect(value).not.toMatch(/\{\d+\}/);
    }
    expect(copy.saveFailed('example')).toContain('example');
    const group = desktopPetConfigGroups(language).find(group => group.id === 'world:desktop-pet:observation');
    expect(group?.schema.properties?.['worlds.desktop-pet.observation.enabled']?.['x-hot']).toBe(true);
  });
  it('starts off and refuses reversed, fractional or out-of-range intervals', () => {
    const defaults = DESKTOP_PET_DEFAULTS.observation;
    expect(defaults.enabled).toBe(false);
    expect(validObservationInterval(defaults.minIntervalSeconds, defaults.maxIntervalSeconds)).toBe(true);
    expect(validObservationInterval(30, 30)).toBe(true);
    for (const [min, max] of [[901, 300], [29, 900], [300, 86401], [30.5, 900], [300, NaN]]) expect(validObservationInterval(min, max)).toBe(false);
  });
});
