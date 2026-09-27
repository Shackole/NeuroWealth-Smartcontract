'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  ChevronRight,
  ChevronLeft,
  Wallet,
  TrendingUp,
  ArrowDownCircle,
  CheckCircle2,
  Zap,
  ShieldCheck,
  BarChart3,
} from 'lucide-react';
import { connectFreighterWallet } from '@/lib/freighter';

// ─── Types ───────────────────────────────────────────────────────────────────

type Strategy = 'Conservative' | 'Balanced' | 'Growth';

type WizardStep =
  | 'welcome'
  | 'connect-wallet'
  | 'choose-strategy'
  | 'deposit'
  | 'confirmation';

interface WizardState {
  step: WizardStep;
  publicKey: string | null;
  strategy: Strategy;
  depositAmount: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STEPS: WizardStep[] = [
  'welcome',
  'connect-wallet',
  'choose-strategy',
  'deposit',
  'confirmation',
];

const ONBOARDED_KEY = 'neurowealth-onboarded';
const WIZARD_STATE_KEY = 'neurowealth-wizard-state';

const STRATEGY_DETAILS: Record<
  Strategy,
  { apy: string; risk: string; description: string; color: string; icon: React.ReactNode }
> = {
  Conservative: {
    apy: '3–6%',
    risk: 'Low',
    description: 'Stablecoin lending on Blend. Steady yield, minimal risk.',
    color: 'indigo',
    icon: <ShieldCheck size={20} />,
  },
  Balanced: {
    apy: '6–10%',
    risk: 'Medium',
    description: 'Mix of lending + DEX liquidity. Good balance of safety and yield.',
    color: 'emerald',
    icon: <BarChart3 size={20} />,
  },
  Growth: {
    apy: '10–15%',
    risk: 'Higher',
    description: 'Aggressive multi-protocol deployment for maximum returns.',
    color: 'amber',
    icon: <TrendingUp size={20} />,
  },
};

// ─── Step Components ──────────────────────────────────────────────────────────

function WelcomeStep() {
  return (
    <div className="flex flex-col items-center text-center gap-4">
      <div className="h-20 w-20 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20">
        <Zap size={40} />
      </div>
      <div>
        <h2 className="text-2xl font-extrabold text-white mb-2">Welcome to NeuroWealth</h2>
        <p className="text-slate-400 text-sm leading-relaxed max-w-xs">
          Your AI-powered DeFi yield engine on Stellar. Deposit once — the AI finds the best yield
          24/7. Withdraw anytime, no lock-ups.
        </p>
      </div>
      <div className="grid grid-cols-3 gap-3 w-full mt-2">
        {[
          { icon: <Zap size={14} />, label: '3–5s finality' },
          { icon: <ShieldCheck size={14} />, label: 'Non-custodial' },
          { icon: <TrendingUp size={14} />, label: 'Auto-rebalancing' },
        ].map(({ icon, label }) => (
          <div
            key={label}
            className="flex flex-col items-center gap-1.5 bg-slate-900/60 rounded-xl py-3 border border-slate-800 text-xs text-slate-300"
          >
            <span className="text-emerald-400">{icon}</span>
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}

function ConnectWalletStep({
  publicKey,
  onConnect,
}: {
  publicKey: string | null;
  onConnect: (key: string) => void;
}) {
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    setConnecting(true);
    setError(null);
    try {
      const key = await connectFreighterWallet();
      if (key) {
        onConnect(key);
      } else {
        setError('Connection cancelled or Freighter not installed.');
      }
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="flex flex-col items-center text-center gap-5">
      <div className="h-16 w-16 rounded-2xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center border border-indigo-500/20">
        <Wallet size={32} />
      </div>
      <div>
        <h2 className="text-xl font-bold text-white mb-2">Connect Your Wallet</h2>
        <p className="text-slate-400 text-sm leading-relaxed max-w-xs">
          Connect your Freighter wallet to start earning yield. Your private keys never leave your
          browser.
        </p>
      </div>

      {publicKey ? (
        <div className="w-full bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 flex items-center gap-2 text-sm">
          <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
          <span className="text-emerald-300 font-mono text-xs truncate">{publicKey}</span>
        </div>
      ) : (
        <>
          <button
            id="connect-wallet-btn"
            onClick={handleConnect}
            disabled={connecting}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold py-3.5 rounded-xl transition-all shadow-glow-emerald disabled:opacity-60"
          >
            {connecting ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin" />
                Connecting…
              </span>
            ) : (
              <>
                <Wallet size={18} />
                Connect Freighter Wallet
              </>
            )}
          </button>
          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 w-full text-center">
              {error}
            </p>
          )}
          <p className="text-xs text-slate-500">
            Don&apos;t have Freighter?{' '}
            <a
              href="https://freighter.app"
              target="_blank"
              rel="noreferrer"
              className="text-emerald-400 hover:underline"
            >
              Install it here
            </a>
          </p>
        </>
      )}
    </div>
  );
}

function ChooseStrategyStep({
  selected,
  onChange,
}: {
  selected: Strategy;
  onChange: (s: Strategy) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="text-center">
        <h2 className="text-xl font-bold text-white mb-1">Choose Your Strategy</h2>
        <p className="text-slate-400 text-sm">
          The AI uses this to allocate your funds. You can change it anytime.
        </p>
      </div>

      <div className="space-y-3">
        {(Object.keys(STRATEGY_DETAILS) as Strategy[]).map((strat) => {
          const { apy, risk, description, color, icon } = STRATEGY_DETAILS[strat];
          const isSelected = selected === strat;
          const colorMap: Record<string, string> = {
            indigo: isSelected
              ? 'border-indigo-500 bg-indigo-500/10'
              : 'border-slate-700 hover:border-indigo-500/50',
            emerald: isSelected
              ? 'border-emerald-500 bg-emerald-500/10'
              : 'border-slate-700 hover:border-emerald-500/50',
            amber: isSelected
              ? 'border-amber-500 bg-amber-500/10'
              : 'border-slate-700 hover:border-amber-500/50',
          };
          const iconColorMap: Record<string, string> = {
            indigo: 'text-indigo-400 bg-indigo-500/10',
            emerald: 'text-emerald-400 bg-emerald-500/10',
            amber: 'text-amber-400 bg-amber-500/10',
          };
          const badgeColorMap: Record<string, string> = {
            indigo: 'bg-indigo-500/20 text-indigo-300',
            emerald: 'bg-emerald-500/20 text-emerald-300',
            amber: 'bg-amber-500/20 text-amber-300',
          };

          return (
            <button
              key={strat}
              type="button"
              onClick={() => onChange(strat)}
              className={`w-full text-left flex items-start gap-3 p-4 rounded-xl border transition-all duration-200 ${colorMap[color]}`}
              aria-pressed={isSelected}
            >
              <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${iconColorMap[color]}`}>
                {icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <span className="font-semibold text-white text-sm">{strat}</span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${badgeColorMap[color]}`}>
                    {apy} APY
                  </span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">{description}</p>
                <span className="text-[11px] text-slate-500 mt-0.5 block">Risk: {risk}</span>
              </div>
              {isSelected && (
                <CheckCircle2 size={16} className={`shrink-0 mt-0.5 text-${color}-400`} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DepositStep({
  amount,
  onChange,
  onSkip,
}: {
  amount: string;
  onChange: (v: string) => void;
  onSkip: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="text-center">
        <h2 className="text-xl font-bold text-white mb-1">Make Your First Deposit</h2>
        <p className="text-slate-400 text-sm">
          Start earning immediately. Minimum deposit is 1 USDC, max 10,000 USDC.
        </p>
      </div>

      <div>
        <label htmlFor="deposit-amount" className="text-xs font-medium text-slate-400 mb-1.5 block">
          Amount (USDC)
        </label>
        <div className="relative">
          <input
            id="deposit-amount"
            type="number"
            step="0.01"
            min="1"
            max="10000"
            value={amount}
            onChange={(e) => onChange(e.target.value)}
            placeholder="0.00"
            className="w-full bg-slate-900 border border-slate-700 rounded-xl py-3 px-4 text-white font-mono text-lg focus:outline-none focus:border-emerald-500 transition-colors"
          />
          <span className="absolute right-4 top-3.5 text-slate-400 text-sm font-medium">USDC</span>
        </div>
        <p className="text-[11px] text-slate-500 mt-1.5">
          Your funds are deployed by the AI agent and start earning immediately.
        </p>
      </div>

      <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-3 text-xs space-y-2">
        {[
          ['Withdrawal', 'Anytime, no lock-ups'],
          ['Network fee', '< 0.00001 XLM'],
          ['Custody', 'Non-custodial Soroban vault'],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between">
            <span className="text-slate-400">{k}:</span>
            <span className="text-slate-300 font-mono">{v}</span>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onSkip}
        className="text-xs text-slate-500 hover:text-slate-400 transition-colors underline underline-offset-2 text-center"
      >
        Skip for now — deposit later from the dashboard
      </button>
    </div>
  );
}

function ConfirmationStep({
  publicKey,
  strategy,
  depositAmount,
}: {
  publicKey: string | null;
  strategy: Strategy;
  depositAmount: string;
}) {
  const hasDeposit = parseFloat(depositAmount) > 0;
  return (
    <div className="flex flex-col items-center text-center gap-5">
      <div className="h-16 w-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
        <CheckCircle2 size={36} />
      </div>
      <div>
        <h2 className="text-xl font-bold text-white mb-1">You&apos;re all set! 🎉</h2>
        <p className="text-slate-400 text-sm">
          NeuroWealth is now optimizing your yield around the clock.
        </p>
      </div>

      <div className="w-full bg-slate-900/60 rounded-xl border border-slate-800 p-4 text-sm space-y-2.5 text-left">
        <div className="flex justify-between">
          <span className="text-slate-400">Wallet</span>
          <span className="text-slate-300 font-mono text-xs truncate max-w-[160px]">
            {publicKey ? `${publicKey.substring(0, 8)}…${publicKey.slice(-4)}` : 'Not connected'}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">Strategy</span>
          <span className="text-emerald-400 font-semibold">{strategy}</span>
        </div>
        {hasDeposit && (
          <div className="flex justify-between">
            <span className="text-slate-400">Initial deposit</span>
            <span className="text-emerald-400 font-mono">{parseFloat(depositAmount).toFixed(2)} USDC</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-slate-400">APY range</span>
          <span className="text-slate-300">{STRATEGY_DETAILS[strategy].apy}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Main Wizard Component ────────────────────────────────────────────────────

/** Persists wizard state to localStorage so it survives page refresh */
function saveWizardState(state: Partial<WizardState>) {
  try {
    const existing = loadWizardState();
    localStorage.setItem(WIZARD_STATE_KEY, JSON.stringify({ ...existing, ...state }));
  } catch {}
}

function loadWizardState(): Partial<WizardState> {
  try {
    const raw = localStorage.getItem(WIZARD_STATE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function OnboardingWizard({ onComplete }: { onComplete?: (publicKey: string | null) => void }) {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState<WizardStep>('welcome');
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [strategy, setStrategy] = useState<Strategy>('Balanced');
  const [depositAmount, setDepositAmount] = useState<string>('');

  // Show wizard only for first-time users; restore state from localStorage
  useEffect(() => {
    const onboarded = localStorage.getItem(ONBOARDED_KEY);
    if (onboarded === 'true') return;

    const saved = loadWizardState();
    if (saved.step) setStep(saved.step);
    if (saved.publicKey) setPublicKey(saved.publicKey);
    if (saved.strategy) setStrategy(saved.strategy);
    if (saved.depositAmount) setDepositAmount(saved.depositAmount);

    const t = setTimeout(() => setVisible(true), 800);
    return () => clearTimeout(t);
  }, []);

  const currentIndex = STEPS.indexOf(step);
  const progress = ((currentIndex + 1) / STEPS.length) * 100;

  const persist = useCallback(
    (patch: Partial<WizardState>) => {
      saveWizardState({ step, publicKey, strategy, depositAmount, ...patch });
    },
    [step, publicKey, strategy, depositAmount]
  );

  const goNext = () => {
    const nextStep = STEPS[currentIndex + 1];
    if (nextStep) {
      setStep(nextStep);
      persist({ step: nextStep });
    } else {
      complete();
    }
  };

  const goPrev = () => {
    const prevStep = STEPS[currentIndex - 1];
    if (prevStep) {
      setStep(prevStep);
      persist({ step: prevStep });
    }
  };

  const complete = () => {
    localStorage.setItem(ONBOARDED_KEY, 'true');
    localStorage.removeItem(WIZARD_STATE_KEY);
    setVisible(false);
    onComplete?.(publicKey);
  };

  const dismiss = () => {
    // Save progress and mark onboarded so wizard doesn't reappear
    localStorage.setItem(ONBOARDED_KEY, 'true');
    localStorage.removeItem(WIZARD_STATE_KEY);
    setVisible(false);
  };

  // Next button label/state
  const isLastStep = currentIndex === STEPS.length - 1;
  const nextDisabled = step === 'connect-wallet' && !publicKey;

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="NeuroWealth onboarding wizard"
    >
      <div className="glass-panel w-full max-w-sm rounded-2xl p-6 relative shadow-2xl border border-slate-700">
        {/* Close / skip */}
        <button
          onClick={dismiss}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
          aria-label="Skip onboarding"
        >
          <X size={18} />
        </button>

        {/* Progress */}
        <div className="mb-5">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span>Step {currentIndex + 1} of {STEPS.length}</span>
            <button
              onClick={dismiss}
              className="hover:text-slate-300 transition-colors"
            >
              Skip wizard
            </button>
          </div>
          <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
            <div
              className="h-full bg-emerald-500 transition-all duration-400"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Step content */}
        <div className="min-h-[280px] flex flex-col justify-center">
          {step === 'welcome' && <WelcomeStep />}

          {step === 'connect-wallet' && (
            <ConnectWalletStep
              publicKey={publicKey}
              onConnect={(key) => {
                setPublicKey(key);
                persist({ publicKey: key });
              }}
            />
          )}

          {step === 'choose-strategy' && (
            <ChooseStrategyStep
              selected={strategy}
              onChange={(s) => {
                setStrategy(s);
                persist({ strategy: s });
              }}
            />
          )}

          {step === 'deposit' && (
            <DepositStep
              amount={depositAmount}
              onChange={(v) => {
                setDepositAmount(v);
                persist({ depositAmount: v });
              }}
              onSkip={() => {
                setDepositAmount('');
                goNext();
              }}
            />
          )}

          {step === 'confirmation' && (
            <ConfirmationStep
              publicKey={publicKey}
              strategy={strategy}
              depositAmount={depositAmount}
            />
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-6">
          <button
            onClick={goPrev}
            disabled={currentIndex === 0}
            className="flex items-center gap-1 px-4 py-2 text-sm text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft size={16} />
            Back
          </button>

          <button
            onClick={isLastStep ? complete : goNext}
            disabled={nextDisabled}
            className="flex items-center gap-1.5 px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isLastStep ? (
              <>
                Go to Dashboard
                <CheckCircle2 size={15} />
              </>
            ) : (
              <>
                Next
                <ChevronRight size={15} />
              </>
            )}
          </button>
        </div>

        {/* Step dots */}
        <div className="flex justify-center gap-1.5 mt-5">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={`rounded-full transition-all duration-200 ${
                i === currentIndex
                  ? 'bg-emerald-400 w-6 h-2'
                  : i < currentIndex
                  ? 'bg-emerald-500/50 w-2 h-2'
                  : 'bg-slate-700 w-2 h-2'
              }`}
              aria-label={`Step ${i + 1}${i === currentIndex ? ' (current)' : ''}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
