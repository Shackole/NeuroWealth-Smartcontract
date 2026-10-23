# Monetary units and serialization

Use the unit at the boundary where a value is read or written. Never use
JavaScript floating point as an input to financial execution or as an
intermediate for converting raw contract integers.

| Value | Representation | Scale / rule | Source |
| --- | --- | --- | --- |
| USDC amount in Soroban contract storage/events | signed `i128` raw units | 7 decimal places; `1 USDC = 10,000,000` raw units | vault contract and `DECIMAL_PLACES` in the generated client |
| Share balances and supply | signed `i128` raw share units | Seven-decimal accounting scale; bootstrap parity mints 10,000,000 raw shares per 1 USDC; retain as `bigint` off-chain | `convert_to_shares`, `convert_to_assets`, `UserInfo` |
| Exchange rate | signed `i128` fixed point | assets per share multiplied by `10,000,000`; `10,500,000` represents `1.05` | `get_exchange_rate` |
| Basis points (`bps`) | `u32` integer | `10,000 bps = 100%`; `850 bps = 8.5%` | allocation/APY methods and events |
| Decimal API amount | decimal string | seven fractional digits for USDC, e.g. `"12.3456789"` | `agent/src/apiRouter.ts` responses |
| Ledger sequence / ledger TTL | integer count | ledger number or count of ledgers; never a token amount | Soroban RPC / contract TTL fields |

## Exact conversion example

Parse a positive USDC decimal string without a floating-point conversion:

```ts
function usdcToRaw(value: string): bigint {
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,7}))?$/.exec(value);
  if (!match) throw new Error('Expected a non-negative USDC decimal with at most 7 places');
  const fraction = (match[2] ?? '').padEnd(7, '0');
  return BigInt(match[1]) * 10_000_000n + BigInt(fraction || '0');
}

usdcToRaw('12.3456789'); // 123456789n raw units
```

Formatting raw units is integer division and remainder, not `Number(raw) / 1e7`:

```ts
function rawToUsdc(raw: bigint): string {
  const whole = raw / 10_000_000n;
  const fraction = (raw % 10_000_000n).toString().padStart(7, '0');
  return `${whole}.${fraction}`;
}

rawToUsdc(123456789n); // "12.3456789"
```

For exact share/asset conversion, use the contract/client integer methods and
their documented rounding: deposit conversions floor minted shares; withdrawals
round the shares burned up, while asset output rounds down. Do not reproduce
those calculations with JS `Number` in a client.

For basis points, store and transmit the integer value. To display a percent,
format the remainder exactly: 850 bps is 8.50%, since one basis point is 0.01%.
Do not confuse the Blend raw APY input (fixed point scaled by `10,000,000`) with
the vault APY event/API output (basis points).

## API transport differences

The paginated routes in `agent/src/apiRouter.ts` return USDC balances and
transaction amounts as decimal strings. The older `agent/src/api.ts` router
returns some monetary values as JavaScript numbers, including `balance`,
`shares`, and `exchangeRate`; those values are display-oriented and lose exact
precision for large values. Neither route should be treated as a contract
transaction builder. The production entrypoint and route mounting status are
documented in [`agent/API.md`](../agent/API.md).

## Review evidence

- `neurowealth-vault/contracts/vault/src/lib.rs` documents USDC's seven-decimal
  raw representation and the exchange-rate scalar.
- `packages/vault-client/src/generated/vault.ts` exposes amount and share
  values as `bigint`, and declares `DECIMAL_PLACES = 7`.
- `agent/src/apiRouter.ts` preserves monetary values as decimal strings in
  balance, earnings, and transaction history responses.
- `ARCHITECTURE.md` links this glossary at the contract/client boundary.
