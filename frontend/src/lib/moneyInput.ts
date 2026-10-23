/** Parse a user-entered USDC amount without accepting locale grouping or exponents. */
export function parseUsdcAmount(input: string): number | null {
  const value = input.trim();
  if (!/^\d+(?:\.\d{1,7})?$/.test(value)) return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}
