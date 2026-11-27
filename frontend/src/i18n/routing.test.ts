import { describe, expect, it } from 'vitest';
import { resolveBrowserLocale, resolveLocale, routing } from './routing';

describe('locale fallback', () => {
  it('uses the default for missing or invalid request locales', () => {
    expect(resolveLocale(undefined)).toBe(routing.defaultLocale);
    expect(resolveLocale('')).toBe(routing.defaultLocale);
    expect(resolveLocale('de')).toBe(routing.defaultLocale);
    for (const locale of routing.locales) {
      expect(resolveLocale(locale)).toBe(locale);
    }
  });

  it('uses the default when browser preferences are missing or unsupported', () => {
    expect(resolveBrowserLocale()).toBe(routing.defaultLocale);
    expect(resolveBrowserLocale(['de-DE', ''])).toBe(routing.defaultLocale);
  });

  it('uses the first supported browser preference, including regional tags', () => {
    expect(resolveBrowserLocale(['de-DE', 'PT-BR', 'fr'])).toBe('pt');
  });
});
