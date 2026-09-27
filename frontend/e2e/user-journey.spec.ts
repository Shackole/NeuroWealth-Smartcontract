import { test, expect } from '@playwright/test';
import { injectFreighterMock, TESTNET_PREFUNDED_ACCOUNT } from './helpers/mockFreighter';

test.describe('NeuroWealth Stellar Testnet E2E User Journey', () => {
  test.beforeEach(async ({ page }) => {
    // Inject the mock Freighter extension before loading the page
    await injectFreighterMock(page, { publicKey: TESTNET_PREFUNDED_ACCOUNT });
  });

  test('connect Freighter wallet (mock extension injected)', async ({ page }) => {
    await page.goto('/');

    // Verify connect wallet button is initially visible
    const connectBtn = page.getByTestId('connect-wallet-button');
    await expect(connectBtn).toBeVisible();
    await expect(connectBtn).toHaveText(/Connect Wallet/i);

    // Initial state before connecting: balance should display 0.00
    const balanceEl = page.getByTestId('total-balance');
    await expect(balanceEl).toHaveText('0.00');

    // Deposit and withdraw buttons should be disabled prior to wallet connection
    const depositBtn = page.getByTestId('deposit-button');
    const withdrawBtn = page.getByTestId('withdraw-button');
    await expect(depositBtn).toBeDisabled();
    await expect(withdrawBtn).toBeDisabled();

    // Click Connect Wallet
    await connectBtn.click();

    // Verify wallet connected status and shortened public key displayed
    const walletInfo = page.getByTestId('connected-wallet-info');
    await expect(walletInfo).toBeVisible();

    const walletAddress = page.getByTestId('wallet-address');
    await expect(walletAddress).toBeVisible();
    // Shortened public key for GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5 is GBBD...FLA5
    await expect(walletAddress).toHaveText(/GBBD\.\.\.FLA5/);

    // Action buttons are now enabled
    await expect(depositBtn).toBeEnabled();
    await expect(withdrawBtn).toBeEnabled();

    // Balance reflects loaded vault state
    await expect(balanceEl).not.toHaveText('0.00');
  });

  test('deposit 10 USDC — form submit → transaction signing → success toast', async ({ page }) => {
    await page.goto('/');

    // 1. Connect Wallet
    await page.getByTestId('connect-wallet-button').click();
    await expect(page.getByTestId('connected-wallet-info')).toBeVisible();

    // 2. Open Deposit Modal
    const depositBtn = page.getByTestId('deposit-button');
    await expect(depositBtn).toBeEnabled();
    await depositBtn.click();

    // Verify Modal opened in deposit mode
    const modal = page.getByTestId('action-modal');
    await expect(modal).toBeVisible();
    await expect(page.getByTestId('modal-heading')).toContainText('deposit USDC');

    // 3. Form input: fill 10 USDC
    const amountInput = page.getByTestId('amount-input');
    await amountInput.fill('10');
    await expect(amountInput).toHaveValue('10');

    // Verify preview calculation (10 / 1.042 = 9.5969 NV-SHARES)
    const sharesPreview = page.getByTestId('estimated-shares-display');
    await expect(sharesPreview).toContainText('9.5969 NV-SHARES');

    // 4. Submit Form and Sign Transaction with Freighter
    const confirmBtn = page.getByTestId('confirm-submit-button');
    await expect(confirmBtn).toBeEnabled();
    await confirmBtn.click();

    // 5. Verification: Transaction modal shows confirmation
    const successModal = page.getByTestId('tx-success-modal');
    await expect(successModal).toBeVisible();
    await expect(page.getByTestId('success-title')).toHaveText('Deposit Successful!');
    await expect(page.getByTestId('tx-hash-display')).toContainText('Transaction Hash: 0x');

    // Close modal via Done button
    await page.getByTestId('modal-done-button').click();
    await expect(modal).not.toBeVisible();

    // 6. Success Toast is displayed on the dashboard
    const successToast = page.getByTestId('success-toast');
    await expect(successToast).toBeVisible();
    await expect(page.getByTestId('toast-message')).toContainText('Successfully deposited 10 USDC');
  });

  test('dashboard shows updated balance after deposit', async ({ page }) => {
    await page.goto('/');

    // Connect wallet
    await page.getByTestId('connect-wallet-button').click();
    await expect(page.getByTestId('connected-wallet-info')).toBeVisible();

    // Capture initial vault balance
    const balanceEl = page.getByTestId('total-balance');
    await expect(balanceEl).toBeVisible();
    const initialText = await balanceEl.innerText();
    const initialBalance = parseFloat(initialText.replace(/,/g, ''));
    expect(initialBalance).toBeGreaterThan(0);

    // Deposit 10 USDC
    await page.getByTestId('deposit-button').click();
    await page.getByTestId('amount-input').fill('10');
    await page.getByTestId('confirm-submit-button').click();
    await expect(page.getByTestId('tx-success-modal')).toBeVisible();
    await page.getByTestId('modal-done-button').click();

    // Verify updated balance = initialBalance + 10
    const expectedBalance = (initialBalance + 10).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    await expect(balanceEl).toHaveText(expectedBalance);
  });

  test('withdraw 5 USDC — preview shows correct amount → confirm → success', async ({ page }) => {
    await page.goto('/');

    // Connect wallet
    await page.getByTestId('connect-wallet-button').click();
    await expect(page.getByTestId('connected-wallet-info')).toBeVisible();

    // Open Withdraw Modal
    const withdrawBtn = page.getByTestId('withdraw-button');
    await expect(withdrawBtn).toBeEnabled();
    await withdrawBtn.click();

    // Verify modal is in withdraw mode
    const modal = page.getByTestId('action-modal');
    await expect(modal).toBeVisible();
    await expect(page.getByTestId('modal-heading')).toContainText('withdraw USDC');

    // Fill 5 USDC
    const amountInput = page.getByTestId('amount-input');
    await amountInput.fill('5');
    await expect(amountInput).toHaveValue('5');

    // Preview shows correct amount: (5 / 1.042) = 4.7985 NV-SHARES
    const sharesPreview = page.getByTestId('estimated-shares-display');
    await expect(sharesPreview).toBeVisible();
    await expect(sharesPreview).toHaveText('4.7985 NV-SHARES');

    // Confirm withdrawal
    const confirmBtn = page.getByTestId('confirm-submit-button');
    await expect(confirmBtn).toBeEnabled();
    await confirmBtn.click();

    // Success in modal
    await expect(page.getByTestId('tx-success-modal')).toBeVisible();
    await expect(page.getByTestId('success-title')).toHaveText('Withdrawal Successful!');

    // Close modal
    await page.getByTestId('modal-done-button').click();
    await expect(modal).not.toBeVisible();

    // Success toast appears on dashboard
    const successToast = page.getByTestId('success-toast');
    await expect(successToast).toBeVisible();
    await expect(page.getByTestId('toast-message')).toContainText('Successfully withdrew 5 USDC');
  });

  test('transaction appears in history table after deposit/withdraw', async ({ page }) => {
    await page.goto('/');

    // Connect wallet
    await page.getByTestId('connect-wallet-button').click();
    await expect(page.getByTestId('connected-wallet-info')).toBeVisible();

    // 1. Perform Deposit of 10 USDC
    await page.getByTestId('deposit-button').click();
    await page.getByTestId('amount-input').fill('10');
    await page.getByTestId('confirm-submit-button').click();
    await expect(page.getByTestId('tx-success-modal')).toBeVisible();
    await page.getByTestId('modal-done-button').click();

    // 2. Perform Withdrawal of 5 USDC
    await page.getByTestId('withdraw-button').click();
    await page.getByTestId('amount-input').fill('5');
    await page.getByTestId('confirm-submit-button').click();
    await expect(page.getByTestId('tx-success-modal')).toBeVisible();
    await page.getByTestId('modal-done-button').click();

    // 3. Verify history table has both new records at the top
    const table = page.getByTestId('transaction-history-table');
    await expect(table).toBeVisible();

    const rows = table.locator('tr[data-testid="transaction-row"]');
    await expect(rows).toHaveCount(5); // 3 initial + 2 new

    // Row 0 should be the latest transaction: withdrawal of 5 USDC
    const latestRow = rows.nth(0);
    await expect(latestRow.getByTestId('tx-type')).toHaveText('withdrawal');
    await expect(latestRow.getByTestId('tx-amount')).toContainText('5 USDC');
    await expect(latestRow.getByTestId('tx-status')).toHaveText('confirmed');

    // Row 1 should be the deposit of 10 USDC
    const secondRow = rows.nth(1);
    await expect(secondRow.getByTestId('tx-type')).toHaveText('deposit');
    await expect(secondRow.getByTestId('tx-amount')).toContainText('10 USDC');
    await expect(secondRow.getByTestId('tx-status')).toHaveText('confirmed');
  });

  test('full end-to-end user journey: connect wallet → deposit 10 USDC → verify balance → withdraw 5 USDC → check history', async ({ page }) => {
    await page.goto('/');

    // 1. Connect Freighter wallet via hero Get Started or Header button
    const getStartedBtn = page.getByTestId('get-started-button');
    await expect(getStartedBtn).toBeVisible();
    await getStartedBtn.click();

    const walletInfo = page.getByTestId('connected-wallet-info');
    await expect(walletInfo).toBeVisible();
    await expect(page.getByTestId('wallet-address')).toHaveText(/GBBD\.\.\.FLA5/);

    // Initial balance check
    const balanceEl = page.getByTestId('total-balance');
    const startBalance = parseFloat((await balanceEl.innerText()).replace(/,/g, ''));

    // 2. Deposit 10 USDC
    await page.getByTestId('deposit-button').click();
    await page.getByTestId('amount-input').fill('10');
    await expect(page.getByTestId('estimated-shares-display')).toHaveText('9.5969 NV-SHARES');
    await page.getByTestId('confirm-submit-button').click();
    await expect(page.getByTestId('tx-success-modal')).toBeVisible();
    await page.getByTestId('modal-done-button').click();

    // Verify balance increased by 10
    const expectedAfterDeposit = (startBalance + 10).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    await expect(balanceEl).toHaveText(expectedAfterDeposit);

    // 3. Withdraw 5 USDC
    await page.getByTestId('withdraw-button').click();
    await page.getByTestId('amount-input').fill('5');
    await expect(page.getByTestId('estimated-shares-display')).toHaveText('4.7985 NV-SHARES');
    await page.getByTestId('confirm-submit-button').click();
    await expect(page.getByTestId('tx-success-modal')).toBeVisible();
    await page.getByTestId('modal-done-button').click();

    // Verify balance decreased by 5
    const expectedAfterWithdraw = (startBalance + 10 - 5).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    await expect(balanceEl).toHaveText(expectedAfterWithdraw);

    // 4. Verify History table has withdrawal and deposit records
    const table = page.getByTestId('transaction-history-table');
    const rows = table.locator('tr[data-testid="transaction-row"]');
    await expect(rows.nth(0).getByTestId('tx-type')).toHaveText('withdrawal');
    await expect(rows.nth(0).getByTestId('tx-amount')).toContainText('5 USDC');
    await expect(rows.nth(1).getByTestId('tx-type')).toHaveText('deposit');
    await expect(rows.nth(1).getByTestId('tx-amount')).toContainText('10 USDC');
  });
});
