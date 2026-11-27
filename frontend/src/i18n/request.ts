import { getRequestConfig } from 'next-intl/server';
import { resolveLocale } from './routing';

export default getRequestConfig(async ({ locale: explicitLocale, requestLocale }) => {
  const locale = resolveLocale(explicitLocale ?? await requestLocale);

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
