import { z } from 'zod';

export const STRATEGY_OPTIONS = ['Conservative', 'Balanced', 'Growth'] as const;
export type Strategy = typeof STRATEGY_OPTIONS[number];

/** Minimum deposit in USDC (matches contract DEFAULT_MIN_DEPOSIT = 1 USDC) */
export const MIN_DEPOSIT_USDC = 1;

/** Maximum deposit per transaction in USDC (matches contract DEFAULT_MAX_DEPOSIT = 1,000 USDC)
 *  The per-user cap is 10,000 USDC but per-tx max is 1,000 USDC by default.
 *  We cap at 10,000 USDC here to stay within the per-user deposit cap. */
export const MAX_DEPOSIT_USDC = 10_000;

export const depositSchema = z.object({
  amount: z
    .string()
    .min(1, 'Amount is required')
    .refine((val) => !isNaN(parseFloat(val)), { message: 'Amount must be a number' })
    .refine((val) => parseFloat(val) > 0, { message: 'Amount must be greater than zero' })
    .refine((val) => parseFloat(val) >= MIN_DEPOSIT_USDC, {
      message: `Minimum deposit is ${MIN_DEPOSIT_USDC} USDC`,
    })
    .refine((val) => parseFloat(val) <= MAX_DEPOSIT_USDC, {
      message: `Maximum deposit is ${MAX_DEPOSIT_USDC.toLocaleString()} USDC`,
    }),
  strategy: z.enum(STRATEGY_OPTIONS, {
    required_error: 'Strategy is required',
  }),
});

export type DepositFormValues = z.infer<typeof depositSchema>;
