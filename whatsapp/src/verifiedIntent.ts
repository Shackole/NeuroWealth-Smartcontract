import { getPortfolio, handleDeposit, handleWithdraw } from './vaultRouter';
import {
  clearTransactionDraft,
  startTransactionDraft,
  takeTransactionDraft,
} from './transactionDrafts';

export async function processVerifiedIntent(
  phoneHash: string,
  messageBody: string,
): Promise<string> {
  const lower = messageBody.toLowerCase().trim();

  // Balance / portfolio
  if (
    lower.includes('balance') ||
    lower.includes('portfolio') ||
    lower.includes('how much') ||
    lower.includes('my account')
  ) {
    const portfolio = await getPortfolio(phoneHash);
    return (
      `💰 Your NeuroWealth Portfolio\n\n` +
      `Balance: ${portfolio.balance.toFixed(2)} USDC ($${portfolio.usdEquivalent.toFixed(2)})\n` +
      `Earnings today: +$${portfolio.dailyEarnings.toFixed(2)}\n` +
      `Current APY: ${portfolio.apy}%\n` +
      `Strategy: ${portfolio.strategy}`
    );
  }

  if (lower === 'deposit' || lower === 'withdraw') {
    startTransactionDraft(phoneHash, lower);
    const amountHint = lower === 'withdraw' ? ' or "all"' : '';
    return `Enter the USDC amount to ${lower}${amountHint}. This draft expires in 5 minutes.`;
  }

  if (lower === 'cancel') {
    clearTransactionDraft(phoneHash);
    return 'Any pending transaction draft has been cleared.';
  }

  if (/^(?:\d+(?:\.\d+)?(?:\s+usdc)?|all|everything)$/.test(lower)) {
    const withdrawAll = lower === 'all' || lower === 'everything';
    const amount = Number.parseFloat(lower);
    if (!withdrawAll && (!Number.isFinite(amount) || amount <= 0)) {
      return 'Enter a positive USDC amount.';
    }
    const action = takeTransactionDraft(phoneHash);
    if (!action || (withdrawAll && action !== 'withdraw')) {
      return 'There is no matching active transaction draft. Send a new deposit or withdraw command.';
    }
    const result = action === 'deposit'
      ? await handleDeposit(phoneHash, amount)
      : await handleWithdraw(phoneHash, withdrawAll ? undefined : amount, withdrawAll);
    return `🤖 ${result.message}`;
  }

  // Deposit
  const depositMatch = lower.match(/deposit\s+([\d.]+)/);
  if (depositMatch) {
    clearTransactionDraft(phoneHash);
    const amount = parseFloat(depositMatch[1]);
    const strategyMatch = lower.match(/\b(conservative|balanced|growth)\b/);
    const strategy = strategyMatch ? strategyMatch[1] : undefined;
    const result = await handleDeposit(phoneHash, amount, strategy);
    return `🤖 ${result.message}`;
  }

  // Withdraw all
  if (
    lower.includes('withdraw all') ||
    lower.includes('withdraw everything')
  ) {
    clearTransactionDraft(phoneHash);
    const result = await handleWithdraw(phoneHash, undefined, true);
    return `🤖 ${result.message}`;
  }

  // Withdraw amount
  const withdrawMatch = lower.match(/withdraw\s+([\d.]+)/);
  if (withdrawMatch) {
    clearTransactionDraft(phoneHash);
    const amount = parseFloat(withdrawMatch[1]);
    const result = await handleWithdraw(phoneHash, amount, false);
    return `🤖 ${result.message}`;
  }

  // Strategy switch
  const stratMatch = lower.match(
    /switch\s+(?:to\s+)?(conservative|balanced|growth)/,
  );
  if (stratMatch) {
    const strat = stratMatch[1];
    return `✅ Strategy updated to ${strat.toUpperCase()}. The AI agent will rebalance on the next scheduled run.`;
  }

  // Earnings
  if (lower.includes('earn') || lower.includes('yield') || lower.includes('apy')) {
    const portfolio = await getPortfolio(phoneHash);
    return (
      `📈 Earnings Summary\n\n` +
      `Today: +$${portfolio.dailyEarnings.toFixed(2)}\n` +
      `Current APY: ${portfolio.apy}%\n` +
      `Strategy: ${portfolio.strategy}`
    );
  }

  // Greeting
  if (lower === 'hi' || lower === 'hello' || lower === 'help') {
    return (
      `🤖 Hi! I'm your NeuroWealth AI Agent.\n\n` +
      `Commands:\n` +
      `• "balance" — view portfolio\n` +
      `• "deposit 100 USDC" — deposit funds\n` +
      `• "withdraw 50" — withdraw USDC\n` +
      `• "deposit" or "withdraw" — start an amount draft\n` +
      `• "switch to growth" — change strategy\n` +
      `• "earnings" — view yield stats`
    );
  }

  return (
    `I didn't quite catch that. Try:\n` +
    `• "deposit 50 USDC"\n` +
    `• "what's my balance"\n` +
    `• "withdraw all"\n` +
    `• "switch to conservative"`
  );
}
