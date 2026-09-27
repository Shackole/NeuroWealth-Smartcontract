/**
 * Contract interaction helper module.
 * Executes contract calls against Soroban RPC or backend contract endpoints.
 * Intercepted by MSW in test environments.
 */

export interface ContractResponse<T = any> {
  success: boolean;
  txHash?: string;
  data?: T;
  error?: string;
}

export async function depositToVault(user: string, amount: number): Promise<ContractResponse<{ amount: number }>> {
  if (amount <= 0) {
    throw new Error('Deposit amount must be greater than zero');
  }
  const res = await fetch('/api/contract/deposit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user, amount })
  });
  if (!res.ok) {
    throw new Error(`Deposit failed: ${res.statusText}`);
  }
  return await res.json();
}

export async function withdrawFromVault(user: string, amount: number): Promise<ContractResponse<{ amount: number }>> {
  if (amount <= 0) {
    throw new Error('Withdrawal amount must be greater than zero');
  }
  const res = await fetch('/api/contract/withdraw', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user, amount })
  });
  if (!res.ok) {
    throw new Error(`Withdrawal failed: ${res.statusText}`);
  }
  return await res.json();
}

export async function withdrawAllFromVault(user: string): Promise<ContractResponse<{ amountWithdrawn: number }>> {
  const res = await fetch('/api/contract/withdraw_all', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user })
  });
  if (!res.ok) {
    throw new Error(`Withdraw All failed: ${res.statusText}`);
  }
  return await res.json();
}

export async function setUserStrategy(user: string, strategy: 'conservative' | 'balanced' | 'growth'): Promise<ContractResponse<{ strategy: string }>> {
  const res = await fetch('/api/contract/set_user_strategy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user, strategy })
  });
  if (!res.ok) {
    throw new Error(`Set strategy failed: ${res.statusText}`);
  }
  return await res.json();
}
