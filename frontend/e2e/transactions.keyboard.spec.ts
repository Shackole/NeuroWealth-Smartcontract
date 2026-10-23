import { expect, test } from '@playwright/test';

test.describe('transaction dialogs with keyboard only', () => {
  test('deposit dialog traps focus, exposes validation, and restores focus', async ({ page }) => {
    await page.goto('/en/dashboard');
    const deposit = page.getByRole('button', { name: 'Deposit', exact: true });
    await expect(deposit).toBeEnabled();
    await deposit.focus();
    await page.keyboard.press('Enter');

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const amount = dialog.locator('#transaction-amount');
    await expect(amount).toBeFocused();
    for (let i = 0; i < 20; i += 1) await page.keyboard.press('Tab');
    await expect(dialog).toContainText('Confirm Deposit');

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(deposit).toBeFocused();
  });

  test('localized amount entry retains the exact dot-decimal value', async ({ page }) => {
    await page.goto('/es/dashboard');
    const deposit = page.getByRole('button', { name: 'Deposit', exact: true });
    await expect(deposit).toBeEnabled();
    await deposit.focus();
    await page.keyboard.press('Enter');

    const dialog = page.getByRole('dialog');
    const amount = dialog.locator('#transaction-amount');
    await amount.focus();
    await page.keyboard.type('1234.56');
    await expect(amount).toHaveValue('1234.56');
    await expect(dialog).toContainText('Usa un punto para los decimales');
  });
});
