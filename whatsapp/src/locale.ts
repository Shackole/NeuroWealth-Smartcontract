export type Locale = 'en' | 'es';

export const DEFAULT_LOCALE: Locale = 'en';

/** Resolve language tags such as es-MX to a supported conversation language. */
export function resolveLocale(value: string): Locale {
  return value.toLowerCase().split('-')[0] === 'es' ? 'es' : DEFAULT_LOCALE;
}

export function translate(locale: Locale, english: string, spanish: string): string {
  return locale === 'es' ? spanish : english;
}
