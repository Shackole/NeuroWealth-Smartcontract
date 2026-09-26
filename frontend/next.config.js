/** @type {import('next').NextConfig} */
const createNextIntlPlugin = require('next-intl/plugin');
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

const withNextIntl = createNextIntlPlugin(
  './src/i18n/request.ts'
);

const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@stellar/stellar-sdk', '@stellar/freighter-api'],
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60,
  },
};

module.exports = withBundleAnalyzer(withNextIntl(nextConfig));
