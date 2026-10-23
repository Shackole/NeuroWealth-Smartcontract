'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';

const SUPPORTED_LOCALES = ['en', 'es', 'fr', 'pt', 'zh', 'ja'];
const LOCALE_STORAGE_KEY = 'neurowealth_locale';

/**
 * Detect the user's preferred locale from the browser on first visit.
 * Falls back to 'en' when the browser language is not supported.
 */
function detectBrowserLocale(): string {
  if (typeof navigator === 'undefined') return 'en';
  const langs = navigator.languages ?? [navigator.language];
  for (const lang of langs) {
    const base = lang.split('-')[0].toLowerCase();
    if (SUPPORTED_LOCALES.includes(base)) return base;
  }
  return 'en';
}

export function LanguageSwitcher() {
  const t = useTranslations('LanguageSwitcher');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  // Auto-detect browser locale on first visit
  useEffect(() => {
    const saved = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (!saved) {
      const detected = detectBrowserLocale();
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
        <option value="en">🇬🇧 English</option>
        <option value="es">🇪🇸 Español</option>
        <option value="fr">🇫🇷 Français</option>
        <option value="pt">🇧🇷 Português</option>
        <option value="zh">🇨🇳 中文</option>
        <option value="ja">🇯🇵 日本語</option>
      </select>
    </div>
  );
}
