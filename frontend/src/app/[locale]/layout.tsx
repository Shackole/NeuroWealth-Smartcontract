import type { Metadata } from 'next';
import './globals.css';
import { ThemeProvider } from '@/components/ThemeProvider';
import { OnboardingTutorial } from '@/components/OnboardingTutorial';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { locales } from '@/i18n/request';

const BASE_URL = 'https://neurowealth.app';
const DEFAULT_TITLE = 'NeuroWealth | AI-Powered DeFi Yield Platform on Stellar';
const DEFAULT_DESCRIPTION =
  'Autonomous AI investment agent managing crypto yield on Stellar blockchain. Deposit once, earn up to 15% APY with automatic rebalancing.';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const canonicalUrl = `${BASE_URL}/${locale}`;

  // Build alternates.languages for all supported locales
  const languages: Record<string, string> = {};
  for (const loc of locales) {
    languages[loc] = `${BASE_URL}/${loc}`;
  }
  // x-default points to the root / canonical
  languages['x-default'] = BASE_URL;

  return {
    title: {
      default: DEFAULT_TITLE,
      template: 'NeuroWealth | %s',
    },
    description: DEFAULT_DESCRIPTION,
    metadataBase: new URL(BASE_URL),
    alternates: {
      canonical: canonicalUrl,
      languages,
    },
    openGraph: {
      type: 'website',
      siteName: 'NeuroWealth',
      title: DEFAULT_TITLE,
      description: DEFAULT_DESCRIPTION,
      url: canonicalUrl,
      images: [
        {
          url: `${BASE_URL}/og-image.png`,
          width: 1200,
          height: 630,
          alt: 'NeuroWealth — AI-Powered DeFi Yield on Stellar',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      site: '@NeuroWealth',
      creator: '@NeuroWealth',
      title: DEFAULT_TITLE,
      description: DEFAULT_DESCRIPTION,
      images: [`${BASE_URL}/og-image.png`],
    },
    verification: {
      google: 'REPLACE_WITH_GOOGLE_VERIFICATION_TOKEN',
      other: {
        'msvalidate.01': 'REPLACE_WITH_BING_VERIFICATION_TOKEN',
      },
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-image-preview': 'large',
        'max-snippet': -1,
      },
    },
  };
}

export default async function RootLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!locales.includes(locale as any)) notFound();
  
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className="antialiased bg-white dark:bg-[#080b11] text-slate-900 dark:text-slate-100 selection:bg-emerald-500 selection:text-black transition-colors duration-300">
        <NextIntlClientProvider messages={messages}>
          <ThemeProvider>
            <OnboardingTutorial />
            <div className="fixed inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(16,185,129,0.15),rgba(255,255,255,0))] dark:bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(16,185,129,0.15),rgba(255,255,255,0))] pointer-events-none z-0" />
            <div className="relative z-10">
              {children}
            </div>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
