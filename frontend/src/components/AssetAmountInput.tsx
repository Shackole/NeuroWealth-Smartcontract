'use client';

import { forwardRef, useId, useState, type ComponentPropsWithoutRef } from 'react';
import { parsePastedAssetAmount } from '@/lib/moneyInput';

type AssetAmountInputProps = Omit<ComponentPropsWithoutRef<'input'>, 'type' | 'onPaste'> & {
  onPasteAmount: (value: string) => void;
};

export const AssetAmountInput = forwardRef<HTMLInputElement, AssetAmountInputProps>(
  function AssetAmountInput({ onPasteAmount, onChange, value, ...props }, ref) {
    const errorId = useId();
    const [pasteError, setPasteError] = useState<string>();
    const visibleError = value === '' ? pasteError : undefined;

    return (
      <>
        <input
          {...props}
          ref={ref}
          type="number"
          inputMode="decimal"
          value={value}
          aria-invalid={visibleError ? true : props['aria-invalid']}
          aria-describedby={
            [visibleError && errorId, props['aria-describedby']].filter(Boolean).join(' ') || undefined
          }
          onChange={(event) => {
            setPasteError(undefined);
            onChange?.(event);
          }}
          onPaste={(event) => {
            event.preventDefault();
            const locale = event.currentTarget.closest('[lang]')?.getAttribute('lang') || 'en';
            const result = parsePastedAssetAmount(event.clipboardData.getData('text/plain'), locale);
            if ('value' in result) {
              setPasteError(undefined);
              onPasteAmount(result.value);
              return;
            }

            const messages = {
              ambiguous: 'This amount is ambiguous. Remove thousands separators or enter the full amount.',
              invalid: 'Enter an amount using the number separators for your current language.',
              precision: 'Use no more than 7 decimal places.',
            };
            setPasteError(messages[result.error]);
            onPasteAmount('');
          }}
        />
        {visibleError && <p id={errorId} role="alert" className="mt-1 text-xs text-rose-400">{visibleError}</p>}
      </>
    );
  },
);
