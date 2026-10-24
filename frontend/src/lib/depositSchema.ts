import { z } from 'zod';
import { parseUsdcAmount } from './moneyInput';

export const STRATEGY_OPTIONS = ['Conservative', 'Balanced', 'Growth'] as const;
export type Strategy = typeof STRATEGY_OPTIONS[number];

/** Minimum deposit in USDC (matches contract DEFAULT_MIN_DEPOSIT = 1 USDC) */
export const MIN_DEPOSIT_USDC = 1;

/** Default contract maximum per deposit: 10,000,000,000 stroops = 1,000 USDC. */
export const MAX_DEPOSIT_USDC = 1_000;

export const depositSchema = z.object({
  amount: z
    .string()
    .min(1, 'Amount is required')
    .refine((val) => parseUsdcAmount(val) !== null, {
      message: 'Use a period for decimals and do not include grouping separators',
    })
    .refine((val) => parseFloat(val) > 0, { message: 'Amount must be greater than zero' })
    .refine((val) => parseFloat(val) >= MIN_DEPOSIT_USDC, {
      message: `Minimum deposit is ${MIN_DEPOSIT_USDC} USDC`,
    })
    .refine((val) => parseFloat(val) <= MAX_DEPOSIT_USDC, {
      message: `Maximum deposit is ${MAX_DEPOSIT_USDC.toLocaleString()} USDC`,
    })
    .refine((val) => {
      const fraction = val.split('.')[1];
      return !fraction || fraction.length <= 7;
    }, { message: 'Use up to 7 decimal places (0.0000001 USDC minimum precision)' }),
  strategy: z.enum(STRATEGY_OPTIONS, {
    required_error: 'Strategy is required',
  }),
});

export type DepositFormValues = z.infer<typeof depositSchema>;
