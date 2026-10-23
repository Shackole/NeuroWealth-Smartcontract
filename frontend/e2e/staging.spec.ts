import { expect, test } from '@playwright/test';

test('staging dashboard loads on the configured locale route', async ({ page }) => {
  await page.goto('/en', { waitUntil: 'domcontentloaded' });

  await expect(page).toHaveTitle(/NeuroWealth/i);
  await expect(
    page.getByRole('heading', { name: /NeuroWealth.*AI-Powered DeFi Yield Platform/i }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /Get Started/i })).toBeVisible();
});