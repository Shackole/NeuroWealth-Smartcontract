'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';

const LOCALE_STORAGE_KEY = 'neurowealth_locale';

export function LanguageSwitcher() {
  const t = useTranslations('LanguageSwitcher');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextLocale = e.target.value;
    // Persist preference to localStorage
    localStorage.setItem(LOCALE_STORAGE_KEY, nextLocale);
    const currentPath = pathname.replace(/^\/[^/]+/, '');
    router.replace(`/${nextLocale}${currentPath}${window.location.search}${window.location.hash}`);
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
