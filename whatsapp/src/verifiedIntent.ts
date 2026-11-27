import { getPortfolio, handleDeposit, handleWithdraw } from './vaultRouter';
import {
  clearTransactionDraft,
  startTransactionDraft,
  takeTransactionDraft,
} from './transactionDrafts';

import { getSessionLocale } from './stateManager';
import { translate } from './locale';

export async function processVerifiedIntent(
  phoneHash: string,
  messageBody: string,
): Promise<string> {
  const locale = getSessionLocale(phoneHash);
  const t = (english: string, spanish: string) => translate(locale, english, spanish);
  const lower = messageBody.toLowerCase().trim();

  // Balance / portfolio
  if (
    lower.includes('balance') ||
    lower.includes('portfolio') ||
    lower.includes('how much') ||
    lower.includes('my account')
  ) {
    const portfolio = await getPortfolio(phoneHash);
    return t(
      `💰 Your NeuroWealth Portfolio\n\n` +
      `Balance: ${portfolio.balance.toFixed(2)} USDC ($${portfolio.usdEquivalent.toFixed(2)})\n` +
      `Earnings today: +$${portfolio.dailyEarnings.toFixed(2)}\n` +
      `Current APY: ${portfolio.apy}%\n` +
      `Strategy: ${portfolio.strategy}`,
      `💰 Tu cartera de NeuroWealth\n\n` +
      `Saldo: ${portfolio.balance.toFixed(2)} USDC ($${portfolio.usdEquivalent.toFixed(2)})\n` +
      `Ganancias de hoy: +$${portfolio.dailyEarnings.toFixed(2)}\n` +
      `APY actual: ${portfolio.apy}%\n` +
      `Estrategia: ${portfolio.strategy}`,
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
      ? await handleDeposit(phoneHash, amount, undefined, locale)
      : await handleWithdraw(phoneHash, withdrawAll ? undefined : amount, withdrawAll, locale);
    return `🤖 ${result.message}`;
  }

  // Deposit
  const depositMatch = lower.match(/deposit\s+([\d.]+)/);
  if (depositMatch) {
    clearTransactionDraft(phoneHash);
    const amount = parseFloat(depositMatch[1]);
    const strategyMatch = lower.match(/\b(conservative|balanced|growth)\b/);
    const strategy = strategyMatch ? strategyMatch[1] : undefined;
    const result = await handleDeposit(phoneHash, amount, strategy, locale);
    return `🤖 ${result.message}`;
  }

  // Withdraw all
  if (
    lower.includes('withdraw all') ||
    lower.includes('withdraw everything')
  ) {
    clearTransactionDraft(phoneHash);
    const result = await handleWithdraw(phoneHash, undefined, true, locale);
    return `🤖 ${result.message}`;
  }

  // Withdraw amount
  const withdrawMatch = lower.match(/withdraw\s+([\d.]+)/);
  if (withdrawMatch) {
    clearTransactionDraft(phoneHash);
    const amount = parseFloat(withdrawMatch[1]);
    const result = await handleWithdraw(phoneHash, amount, false, locale);
    return `🤖 ${result.message}`;
  }

  // Strategy switch
  const stratMatch = lower.match(
    /switch\s+(?:to\s+)?(conservative|balanced|growth)/,
  );
  if (stratMatch) {
    const strat = stratMatch[1];
    return t(
      `✅ Strategy updated to ${strat.toUpperCase()}. The AI agent will rebalance on the next scheduled run.`,
      `✅ Estrategia cambiada a ${strat.toUpperCase()}. El agente hará el rebalanceo en la próxima ejecución programada.`,
    );
  }

  // Earnings
  if (lower.includes('earn') || lower.includes('yield') || lower.includes('apy')) {
    const portfolio = await getPortfolio(phoneHash);
    return t(
      `📈 Earnings Summary\n\n` +
      `Today: +$${portfolio.dailyEarnings.toFixed(2)}\n` +
      `Current APY: ${portfolio.apy}%\n` +
      `Strategy: ${portfolio.strategy}`,
      `📈 Resumen de ganancias\n\n` +
      `Hoy: +$${portfolio.dailyEarnings.toFixed(2)}\n` +
      `APY actual: ${portfolio.apy}%\n` +
      `Estrategia: ${portfolio.strategy}`,
    );
  }

  // Greeting
  if (lower === 'hi' || lower === 'hello' || lower === 'help') {
    return t(
      `🤖 Hi! I'm your NeuroWealth AI Agent.\n\n` +
      `Commands:\n` +
      `• "balance" — view portfolio\n` +
      `• "deposit 100 USDC" — deposit funds\n` +
      `• "withdraw 50" — withdraw USDC\n` +
      `• "switch to growth" — change strategy\n` +
      `• "earnings" — view yield stats\n` +
      `• "language es" — switch to Spanish`,
      `🤖 ¡Hola! Soy tu agente de NeuroWealth.\n\n` +
      `Comandos:\n` +
      `• "balance" — consultar la cartera\n` +
      `• "deposit 100 USDC" — depositar fondos\n` +
      `• "withdraw 50" — retirar USDC\n` +
      `• "switch to growth" — cambiar de estrategia\n` +
      `• "earnings" — consultar las ganancias\n` +
      `• "language en" — cambiar a inglés`,
    );
  }

  return t(
    `I didn't quite catch that. Try:\n` +
    `• "deposit 50 USDC"\n` +
    `• "what's my balance"\n` +
    `• "withdraw all"\n` +
    `• "switch to conservative"`,
    `No entendí tu solicitud. Prueba con:\n` +
    `• "deposit 50 USDC"\n` +
    `• "balance"\n` +
    `• "withdraw all"\n` +
    `• "switch to conservative"`,
  );
}
