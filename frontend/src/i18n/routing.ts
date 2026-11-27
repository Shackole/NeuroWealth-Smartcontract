import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['en', 'es', 'fr', 'pt', 'zh', 'ja'],
  defaultLocale: 'en',
});

export type Locale = (typeof routing.locales)[number];

export function isSupportedLocale(value: unknown): value is Locale {
  return routing.locales.some((locale) => locale === value);
}

export function resolveLocale(value: unknown): Locale {
  return isSupportedLocale(value) ? value : routing.defaultLocale;
}

export function resolveBrowserLocale(languages: readonly string[] = []): Locale {
  for (const language of languages) {
    const base = language.split('-')[0].toLowerCase();
    if (isSupportedLocale(base)) return base;
  }

  return routing.defaultLocale;
}
