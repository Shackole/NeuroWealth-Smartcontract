'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';

import { isSupportedLocale, resolveBrowserLocale, routing, type Locale } from '@/i18n/routing';

const LOCALE_STORAGE_KEY = 'neurowealth_locale';
const localeLabels: Record<Locale, string> = {
  en: '🇬🇧 English',
  es: '🇪🇸 Español',
  fr: '🇫🇷 Français',
  pt: '🇧🇷 Português',
  zh: '🇨🇳 中文',
  ja: '🇯🇵 日本語',
};

export function LanguageSwitcher() {
  const t = useTranslations('LanguageSwitcher');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  // Auto-detect browser locale on first visit
  useEffect(() => {
    const saved = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (!isSupportedLocale(saved)) {
      const detected = resolveBrowserLocale(navigator.languages ?? [navigator.language]);
      if (detected !== locale) {
        localStorage.setItem(LOCALE_STORAGE_KEY, detected);
        const currentPath = pathname.replace(`/${locale}`, '');
        router.replace(`/${detected}${currentPath}`);
      } else {
        localStorage.setItem(LOCALE_STORAGE_KEY, locale);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextLocale = e.target.value;
    if (!isSupportedLocale(nextLocale)) return;
    // Persist preference to localStorage
    localStorage.setItem(LOCALE_STORAGE_KEY, nextLocale);
    const currentPath = pathname.replace(`/${locale}`, '');
    router.replace(`/${nextLocale}${currentPath}`);
  };

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="language-select" className="sr-only">
        {t('label')}
      </label>
      <select
        id="language-select"
        value={locale}
        onChange={handleLanguageChange}
        aria-label={t('label')}
        className="bg-transparent text-sm border border-slate-700 rounded-md px-2 py-1 focus:ring-1 focus:ring-emerald-500 focus:outline-none dark:text-white cursor-pointer"
      >
        {routing.locales.map((option) => (
          <option key={option} value={option}>{localeLabels[option]}</option>
        ))}
      </select>
    </div>
  );
}
