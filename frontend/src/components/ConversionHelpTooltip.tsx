'use client';

import React, { useState, useId } from 'react';
import { HelpCircle, X, ArrowRight, TrendingUp, DollarSign, Layers, CheckCircle2 } from 'lucide-react';

interface ConversionHelpTooltipProps {
  currentExchangeRate?: number; // e.g. 1.042
  className?: string;
}

export const ConversionHelpTooltip: React.FC<ConversionHelpTooltipProps> = ({
  currentExchangeRate = 1.042,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [sampleUsdc, setSampleUsdc] = useState<number>(100);
  const tooltipId = useId();

  // Calculation: shares = USDC / exchange_rate
  const calculatedShares = sampleUsdc > 0 ? (sampleUsdc / currentExchangeRate).toFixed(4) : '0.0000';
  // Future projection if rate increases to currentRate * 1.04 (e.g. 4% yield)
  const futureRate = currentExchangeRate * 1.0415;
  const futureValueUsdc = sampleUsdc > 0 ? (parseFloat(calculatedShares) * futureRate).toFixed(2) : '0.00';
  const profitUsdc = (parseFloat(futureValueUsdc) - sampleUsdc).toFixed(2);

  return (
    <div className={`relative inline-flex items-center ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-controls={tooltipId}
        aria-label="Understand how USDC relates to vault shares"
        className="inline-flex items-center gap-1 text-xs text-emerald-400/90 hover:text-emerald-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded px-1 py-0.5"
      >
        <HelpCircle size={14} className="shrink-0" aria-hidden="true" />
        <span className="underline underline-offset-2">Why are shares different from USDC?</span>
      </button>

      {isOpen && (
        <div
          id={tooltipId}
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${tooltipId}-heading`}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm sm:absolute sm:inset-auto sm:left-0 sm:top-6 sm:w-96 sm:bg-transparent sm:p-0 sm:backdrop-blur-none"
        >
          <div className="relative w-full rounded-2xl border border-slate-700 bg-slate-950 p-4 sm:p-5 shadow-2xl text-left text-xs text-slate-300 space-y-3.5 animate-fadeIn">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div className="flex items-center gap-2 text-white font-semibold">
                <Layers size={16} className="text-emerald-400" aria-hidden="true" />
                <h4 id={`${tooltipId}-heading`} className="text-sm">
                  Tokens vs. Vault Shares
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Close unit conversion help"
                className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500"
              >
                <X size={15} />
              </button>
            </div>

            {/* Explanation */}
            <p className="leading-relaxed">
              When you deposit USDC, you receive <strong>vault shares</strong> representing your proportional slice of the vault fund.
            </p>

            <div className="rounded-xl bg-slate-900/80 border border-slate-800 p-3 space-y-2">
              <div className="flex justify-between items-center text-[11px] text-slate-400">
                <span>Current Exchange Rate:</span>
                <span className="font-mono text-emerald-400 font-semibold">
                  1 Share = {currentExchangeRate.toFixed(4)} USDC
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-normal">
                Because the vault has already earned yield, each share is worth more than 1 USDC. You receive fewer shares, but each share has higher purchasing power.
              </p>
            </div>

            {/* Interactive Sample Conversion */}
            <div className="space-y-2">
              <label htmlFor={`${tooltipId}-input`} className="block text-[11px] font-semibold text-slate-200">
                Try a Sample Conversion:
              </label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    id={`${tooltipId}-input`}
                    type="number"
                    min="1"
                    value={sampleUsdc}
                    onChange={(e) => setSampleUsdc(Math.max(0, parseFloat(e.target.value) || 0))}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-white font-mono focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500"
                    placeholder="100"
                  />
                  <span className="absolute right-2.5 top-1.5 text-[11px] text-slate-500 font-mono">
                    USDC
                  </span>
                </div>
                <ArrowRight size={14} className="text-slate-500 shrink-0" aria-hidden="true" />
                <div className="flex-1 rounded-lg border border-emerald-500/30 bg-emerald-950/20 px-3 py-1.5 text-xs font-mono text-emerald-300">
                  {calculatedShares} <span className="text-slate-400 font-sans text-[10px]">Shares</span>
                </div>
              </div>
              <p className="text-[10px] text-slate-400">
                <strong>Value check:</strong> {calculatedShares} shares × {currentExchangeRate.toFixed(4)} = ${sampleUsdc.toFixed(2)} USDC (0% lost).
              </p>
            </div>

            {/* Yield Accrual Example */}
            <div className="rounded-xl bg-emerald-950/30 border border-emerald-500/20 p-2.5 space-y-1 text-[11px]">
              <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                <TrendingUp size={13} aria-hidden="true" />
                <span>How you earn yield:</span>
              </div>
              <p className="text-slate-300 leading-tight">
                When strategies generate yield, the exchange rate increases. If the rate rises to {futureRate.toFixed(4)} USDC:
              </p>
              <div className="font-mono text-emerald-300 text-xs pt-1">
                Withdrawal value: ${futureValueUsdc} USDC (<span className="text-emerald-400">+{profitUsdc} USDC profit</span>)
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="w-full py-1.5 text-center text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              Got it, close help
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
