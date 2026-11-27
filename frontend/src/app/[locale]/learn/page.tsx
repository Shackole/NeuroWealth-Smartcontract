import React from 'react';
import { BookOpen, Zap, ArrowLeft, ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { LearnTopicNav } from '@/components/LearnTopicNav';
import { SampleChart } from './SampleChart';
import { notFound } from 'next/navigation';
import { getLearnArticles, getLearnLabels } from './articles';

export const metadata = {
  title: 'NeuroWealth — Learn DeFi Basics',
  description:
    'Plain-language explanations of APY, shares, exchange rate, rebalancing, Blend, and the Stellar DEX — no prior DeFi knowledge required.',
};

export default async function LearnPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const labels = getLearnLabels(locale);
  if (!labels) notFound();
  const articles = getLearnArticles(locale);
  const topics = [
    { id: 'ai-section', label: 'How the AI works' },
    ...articles.map((entry) => ({ id: entry.slug, label: entry.term.split(' —')[0] })),
  ];

  return (
    <div className="min-h-screen bg-[#080b11] text-slate-100">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Back link */}
        <Link
          href={`/${locale}/dashboard`}
          className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-emerald-400 transition-colors mb-8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          {labels.dashboard}
        </Link>

        {/* Page header */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20">
              <BookOpen size={20} aria-hidden="true" />
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white">{labels.index}</h1>
          </div>
          <p className="text-slate-400 text-sm leading-relaxed max-w-xl">
            New to DeFi? This page explains the key terms used in NeuroWealth in plain language —
            no technical background required.
          </p>
        </div>

        <div className="flex flex-col items-start gap-10 md:flex-row">
          <LearnTopicNav topics={topics} />
          <div className="w-full min-w-0 flex-1">
            {/* AI section */}
            <section
              id="ai-section"
              tabIndex={-1}
              className="scroll-mt-6 mb-10 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-6"
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

            <SampleChart />

            {/* Glossary */}
            <section aria-labelledby="glossary-heading">
              <h2 id="glossary-heading" className="text-xl font-bold text-white mb-6">
                {labels.glossary}
              </h2>
              <dl className="space-y-4">
                {articles.map((entry) => {
                  const EntryIcon = entry.icon;
                  return (
                    <div
                      key={entry.slug}
                      id={entry.slug}
                      tabIndex={-1}
                      className="scroll-mt-6 glass-panel rounded-2xl p-5 border border-slate-700/60"
                    >
                      <dt>
                        <div className="flex items-center gap-3 mb-2">
                          <span
                            className={`p-1.5 rounded-lg bg-slate-800 ${entry.iconColor}`}
                            aria-hidden="true"
                          >
                            <EntryIcon size={16} />
                          </span>
                          <Link href={`/${locale}/learn/${entry.slug}`} className="font-bold text-white text-base hover:underline">
                            {entry.term}
                          </Link>
                        </div>
                        <p className="text-sm font-medium text-emerald-400 mb-2">{entry.summary}</p>
                      </dt>
                      <dd className="text-sm text-slate-400 leading-relaxed">{entry.detail}</dd>
                      <div className="mt-3 pt-3 border-t border-slate-700/40">
                        <Link
                          href={`/${locale}${entry.dashboardLink.href}`}
                          aria-label={`${entry.dashboardLink.label} — press Back to return here`}
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400 hover:text-emerald-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded"
                        >
                          <ArrowUpRight size={13} aria-hidden="true" />
                          {entry.dashboardLink.label}
                        </Link>
                      </div>
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
      </div>
    </div>
  );
}
