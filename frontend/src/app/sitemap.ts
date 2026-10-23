import type { MetadataRoute } from 'next';

const BASE_URL = 'https://neurowealth.app';

// All supported locales (must match src/i18n/request.ts)
const locales = ['en', 'es', 'fr', 'pt', 'zh', 'ja'] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  // Root (language-neutral) entry
  const root: MetadataRoute.Sitemap[number] = {
    url: BASE_URL,
    lastModified: now,
    changeFrequency: 'daily',
    priority: 1.0,
  };

  // One entry per locale
  const localeEntries: MetadataRoute.Sitemap = locales.map((locale) => ({
    url: `${BASE_URL}/${locale}`,
    lastModified: now,
    changeFrequency: 'daily',
    priority: 0.8,
  }));

  return [root, ...localeEntries];
}
