import type { MetadataRoute } from 'next';

const BASE_URL = 'https://neurowealth.app';

import { routing } from '@/i18n/routing';

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
  const localeEntries: MetadataRoute.Sitemap = routing.locales.map((locale) => ({
    url: `${BASE_URL}/${locale}`,
    lastModified: now,
    changeFrequency: 'daily',
    priority: 0.8,
  }));

  return [root, ...localeEntries];
}
