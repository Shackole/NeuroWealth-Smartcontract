import React from 'react';
import { BookOpen, TrendingUp, Layers, RefreshCw, DollarSign, Zap, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

interface GlossaryEntry {
  term: string;
  icon: React.ElementType;
  iconColor: string;
  summary: string;
  detail: string;
}

const GLOSSARY: GlossaryEntry[] = [
  {
    term: 'APY — Annual Percentage Yield',
    icon: TrendingUp,
    iconColor: 'text-emerald-400',
    summary: 'How much your money grows in one year, expressed as a percentage.',
    detail:
      'APY (Annual Percentage Yield) is the real return you earn over a year including the effect of compounding. Compounding means your earnings themselves earn interest. For example, 8% APY on 1,000 USDC means you would have roughly 1,080 USDC after one year — even if the rate was only applied daily and the daily earnings were added back to your balance.',
  },
  {
    term: 'Shares',
    icon: DollarSign,
    iconColor: 'text-indigo-400',
    summary: 'Your ownership record inside the NeuroWealth vault.',
    detail:
      'When you deposit USDC, the smart contract mints "shares" that represent your portion of the total vault. As the vault earns yield, each share becomes worth slightly more USDC. When you withdraw, your shares are burned and you receive back USDC. You never hold shares directly in your wallet — they live inside the Soroban contract.',
  },
  {
    term: 'Exchange Rate',
    icon: RefreshCw,
    iconColor: 'text-amber-400',
    summary: 'How many USDC one share is currently worth.',
    detail:
      'The exchange rate starts at 1.0 (1 share = 1 USDC) and rises over time as yield accumulates in the vault. If the exchange rate is 1.05, each share is worth 1.05 USDC. The rate only ever increases — it never drops from earned yield, though unexpected protocol losses could theoretically reduce it.',
  },
  {
    term: 'Rebalancing',
    icon: Zap,
    iconColor: 'text-emerald-400',
    summary: 'When the AI moves your funds to a better-yielding protocol.',
    detail:
      'The AI agent checks available yield rates across all integrated protocols every hour. If a different protocol offers more than 0.5% higher APY, it calls the vault\'s rebalance function to move the pooled funds. This is fully automated — you do not need to approve each rebalance. The vault enforces a cooldown between rebalances to prevent excessive activity.',
  },
  {
    term: 'Blend Protocol',
    icon: Layers,
    iconColor: 'text-blue-400',
    summary: 'A decentralised lending protocol on the Stellar network.',
    detail:
      'Blend is a lending protocol built with Soroban smart contracts on Stellar. Depositors supply USDC that borrowers can borrow by posting collateral. Lenders earn interest paid by borrowers. NeuroWealth\'s Conservative and Balanced strategies use Blend as the primary yield source. Learn more at blendprotocol.org.',
  },
  {
    term: 'DEX — Decentralised Exchange',
    icon: RefreshCw,
    iconColor: 'text-purple-400',
    summary: 'A trading exchange that runs on-chain with no central operator.',
    detail:
      'Stellar has a built-in DEX where anyone can trade assets without a central company in the middle. Liquidity providers (LPs) deposit pairs of assets into a pool; traders swap through those pools and pay a fee. LPs earn a share of those fees. The Balanced and Growth strategies may deploy funds into Stellar DEX liquidity pools to capture trading fees as an additional yield source.',
  },
];

export const metadata = {
  title: 'NeuroWealth — Learn DeFi Basics',
  description:
    'Plain-language explanations of APY, shares, exchange rate, rebalancing, Blend, and the Stellar DEX — no prior DeFi knowledge required.',
};

export default function LearnPage() {
  return (
    <div className="min-h-screen bg-[#080b11] text-slate-100">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Back link */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-emerald-400 transition-colors mb-8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Back to Dashboard
        </Link>

        {/* Page header */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20">
              <BookOpen size={20} aria-hidden="true" />
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white">Learn DeFi Basics</h1>
          </div>
          <p className="text-slate-400 text-sm leading-relaxed max-w-xl">
            New to DeFi? This page explains the key terms used in NeuroWealth in plain language —
            no technical background required.
          </p>
        </div>

        {/* AI section */}
        <section
          className="mb-10 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-6"
          aria-labelledby="ai-section-heading"
        >
          <h2 id="ai-section-heading" className="text-lg font-bold text-white mb-2 flex items-center gap-2">
            <Zap size={18} className="text-emerald-400" aria-hidden="true" />
            How does the AI manage my money?
          </h2>
          <p className="text-sm text-slate-300 leading-relaxed mb-4">
            NeuroWealth runs an autonomous AI agent that monitors yield rates across DeFi protocols on
            Stellar 24 hours a day. When you deposit USDC, your funds are pooled with other users inside
            a Soroban smart contract (a program that runs directly on the Stellar blockchain).
          </p>
          <p className="text-sm text-slate-300 leading-relaxed mb-4">
            Every hour, the agent compares available interest rates. If a better opportunity exists — one
            that pays more than 0.5% extra APY — it automatically moves the pooled funds via a{' '}
            <strong className="text-white">rebalance</strong> transaction. Your personal share of the
            vault is tracked on-chain at all times, so you can withdraw your portion whenever you like,
            no questions asked.
          </p>
          <p className="text-sm text-slate-300 leading-relaxed">
            The AI never holds your private keys. Your USDC lives inside an audited smart contract, not
            on the AI agent&apos;s server. The agent can only call specific vault functions (rebalance,
            harvest) — it cannot withdraw funds to arbitrary addresses.
          </p>
        </section>

        {/* Glossary */}
        <section aria-labelledby="glossary-heading">
          <h2 id="glossary-heading" className="text-xl font-bold text-white mb-6">
            Glossary
          </h2>
          <dl className="space-y-4">
            {GLOSSARY.map((entry) => {
              const EntryIcon = entry.icon;
              return (
                <div
                  key={entry.term}
                  className="glass-panel rounded-2xl p-5 border border-slate-700/60"
                >
                  <dt>
                    <div className="flex items-center gap-3 mb-2">
                      <span
                        className={`p-1.5 rounded-lg bg-slate-800 ${entry.iconColor}`}
                        aria-hidden="true"
                      >
                        <EntryIcon size={16} />
                      </span>
                      <span className="font-bold text-white text-base">{entry.term}</span>
                    </div>
                    <p className="text-sm font-medium text-emerald-400 mb-2">{entry.summary}</p>
                  </dt>
                  <dd className="text-sm text-slate-400 leading-relaxed">{entry.detail}</dd>
                </div>
              );
            })}
          </dl>
        </section>

        {/* Footer note */}
        <p className="mt-10 text-xs text-slate-500 text-center">
          NeuroWealth is not a licensed financial adviser. DeFi carries risks including smart contract
          vulnerabilities and market volatility. Only deposit funds you can afford to lose.
        </p>
      </div>
    </div>
  );
}
