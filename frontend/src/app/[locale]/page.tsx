'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Bot,
  ChevronDown,
  Github,
  Lock,
  Shield,
  Star,
  TrendingUp,
  Twitter,
  Zap,
} from 'lucide-react';
import { Header } from '@/components/Header';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlatformStats {
  tvl: number;
  avgApy: number;
  users: number;
}

// ─── Animated counter hook (scroll-into-view trigger) ────────────────────────

function useCountUp(target: number, duration = 1800, decimals = 0) {
  const [value, setValue] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || started.current) return;
        started.current = true;

        const start = performance.now();
        const tick = (now: number) => {
          const progress = Math.min((now - start) / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          setValue(parseFloat((eased * target).toFixed(decimals)));
          if (progress < 1) requestAnimationFrame(tick);
          else setValue(target);
        };
        requestAnimationFrame(tick);
      },
      { threshold: 0.3 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [target, duration, decimals]);

  return { value, ref };
}

// ─── Stat card with animated number ──────────────────────────────────────────

function StatCard({
  label,
  value,
  prefix = '',
  suffix = '',
  decimals = 0,
}: {
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
}) {
  const { value: animated, ref } = useCountUp(value, 1800, decimals);
  const display =
    decimals > 0
      ? animated.toFixed(decimals)
      : animated >= 1_000_000
      ? `${(animated / 1_000_000).toFixed(1)}M`
      : animated >= 1_000
      ? `${(animated / 1_000).toFixed(0)}K`
      : Math.round(animated).toLocaleString();

  return (
    <div className="flex flex-col items-center gap-1">
      <span ref={ref} className="text-4xl sm:text-5xl font-extrabold text-white tabular-nums">
        {prefix}
        {display}
        {suffix}
      </span>
      <span className="text-sm text-slate-400 font-medium">{label}</span>
    </div>
  );
}

// ─── FAQ accordion item ───────────────────────────────────────────────────────

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-slate-800 last:border-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-4 py-5 text-left text-sm sm:text-base font-semibold text-white hover:text-emerald-400 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400 rounded"
        aria-expanded={open}
      >
        <span>{q}</span>
        <ChevronDown
          size={18}
          className={`flex-shrink-0 text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>
      {open && (
        <p className="pb-5 text-sm text-slate-400 leading-relaxed">{a}</p>
      )}
    </div>
  );
}

// ─── Main landing page ────────────────────────────────────────────────────────

export default function LandingPage() {
  const [stats, setStats] = useState<PlatformStats>({
    tvl: 2_840_000,
    avgApy: 8.4,
    users: 1247,
  });

  // Fetch live stats with ISR-like revalidation
  useEffect(() => {
    fetch('/api/stats')
      .then((r) => r.json())
      .then((d: PlatformStats) => setStats(d))
      .catch(() => {/* use defaults */});
  }, []);

  const faqItems = [
    {
      q: 'Is NeuroWealth custodial?',
      a: 'No. Your funds are held exclusively in audited Soroban smart contracts on the Stellar blockchain. NeuroWealth never has access to your private keys or the ability to move funds to arbitrary addresses.',
    },
    {
      q: 'How does the AI choose where to deploy my funds?',
      a: 'The agent runs an hourly decision loop: it fetches real-time APYs from Blend and Stellar DEX pools, applies a risk-scoring model, and rebalances if a better opportunity offers more than 0.5% improvement — net of fees.',
    },
    {
      q: 'Can I withdraw at any time?',
      a: 'Yes — there are no lock-up periods or withdrawal penalties. Withdrawals settle on Stellar in 3–5 seconds.',
    },
    {
      q: 'What is the minimum deposit?',
      a: 'The minimum is 1 USDC. Individual user deposits are currently capped at 10,000 USDC (configurable by the vault owner).',
    },
    {
      q: 'Have the contracts been audited?',
      a: 'The Soroban vault contract follows OpenZeppelin-equivalent patterns with strict CEI ordering for reentrancy protection, a timelocked upgrade mechanism, and a two-step ownership transfer. A formal third-party audit is scheduled before mainnet launch.',
    },
    {
      q: 'What is the difference between the strategies?',
      a: 'Conservative (3–6% APY) deploys into Blend stablecoin lending. Balanced (6–10% APY) mixes lending and DEX liquidity. Growth (10–15% APY) pursues aggressive multi-protocol deployment. Your preference is stored on-chain; the AI agent reads it when making allocation decisions.',
    },
  ];

  return (
    <div className="min-h-screen bg-[#080b11] text-slate-100 flex flex-col">
      {/* Skip-to-content for accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 bg-emerald-500 text-slate-950 font-bold px-4 py-2 rounded-lg z-50"
      >
        Skip to main content
      </a>

      <Header publicKey={null} onConnect={() => {}} onDisconnect={() => {}} />

      <main id="main-content" className="flex-1">
        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <section
          aria-labelledby="hero-heading"
          className="relative overflow-hidden px-4 sm:px-6 lg:px-8 pt-20 pb-28 text-center"
        >
          {/* Background glow */}
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(16,185,129,0.18),transparent)] pointer-events-none"
          />

          <div className="relative max-w-4xl mx-auto">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-semibold border border-emerald-500/20 mb-6">
              <Zap size={13} aria-hidden="true" />
              AI-Powered Autonomous Yield on Stellar
            </div>

            <h1
              id="hero-heading"
              className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-white leading-tight mb-6"
            >
              Your money.{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-400">
                Working 24/7.
              </span>
            </h1>

            <p className="text-slate-300 text-lg sm:text-xl max-w-2xl mx-auto mb-4 leading-relaxed">
              NeuroWealth is an AI agent that autonomously deploys your USDC into the
              highest-yielding, safest opportunities across Stellar DeFi — and
              rebalances hourly.
            </p>

            {/* Animated APY highlight */}
            <div className="inline-flex items-baseline gap-1.5 mb-10">
              <span className="text-slate-400 text-lg">Up to</span>
              <ApyCounter target={stats.avgApy} />
              <span className="text-slate-400 text-lg">APY today</span>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/dashboard"
                className="flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold px-8 py-3.5 rounded-full transition-all shadow-[0_0_25px_-5px_rgba(16,185,129,0.5)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
              >
                Start Earning <ArrowRight size={18} aria-hidden="true" />
              </Link>
              <a
                href="#how-it-works"
                className="flex items-center gap-2 text-slate-300 hover:text-white font-semibold px-6 py-3 rounded-full border border-slate-700 hover:border-slate-500 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-400"
              >
                How it works
              </a>
            </div>
          </div>
        </section>

        {/* ── Stats ────────────────────────────────────────────────────── */}
        <section
          aria-labelledby="stats-heading"
          className="py-16 border-y border-slate-800 bg-slate-900/40"
        >
          <h2 id="stats-heading" className="sr-only">Platform statistics</h2>
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 sm:grid-cols-3 gap-10 text-center">
            <StatCard
              label="Total Value Locked"
              value={stats.tvl}
              prefix="$"
            />
            <StatCard
              label="Average APY"
              value={stats.avgApy}
              suffix="%"
              decimals={1}
            />
            <StatCard label="Active Users" value={stats.users} />
          </div>
        </section>

        {/* ── How it works ─────────────────────────────────────────────── */}
        <section
          id="how-it-works"
          aria-labelledby="how-heading"
          className="py-24 px-4 sm:px-6 lg:px-8"
        >
          <div className="max-w-5xl mx-auto">
            <h2
              id="how-heading"
              className="text-3xl sm:text-4xl font-extrabold text-white text-center mb-4"
            >
              Three steps to automated yield
            </h2>
            <p className="text-slate-400 text-center mb-16 max-w-xl mx-auto">
              No DeFi experience required. Deposit once — the AI handles everything else.
            </p>

            <ol className="grid grid-cols-1 md:grid-cols-3 gap-8 list-none" aria-label="How NeuroWealth works">
              {[
                {
                  step: '01',
                  title: 'Deposit USDC',
                  body: 'Connect your Freighter wallet and deposit any amount from 1 USDC. Your funds go directly into the audited Soroban smart contract — no intermediary.',
                  icon: '💰',
                },
                {
                  step: '02',
                  title: 'AI Optimises',
                  body: 'The agent monitors Blend and Stellar DEX pools around the clock. When a better opportunity appears (> 0.5% improvement), it rebalances automatically — with zero input from you.',
                  icon: '🤖',
                },
                {
                  step: '03',
                  title: 'Earn & Withdraw',
                  body: 'Yield accrues every ledger. Withdraw any amount at any time — no lock-ups, no penalty, settled on Stellar in 3–5 seconds.',
                  icon: '📈',
                },
              ].map(({ step, title, body, icon }) => (
                <li
                  key={step}
                  className="relative flex flex-col gap-4 p-7 rounded-2xl border border-slate-800 bg-slate-900/50 hover:border-emerald-500/30 transition-colors"
                >
                  <span
                    aria-hidden="true"
                    className="text-4xl"
                  >
                    {icon}
                  </span>
                  <span
                    aria-hidden="true"
                    className="absolute top-5 right-5 text-xs font-mono font-bold text-slate-600"
                  >
                    {step}
                  </span>
                  <h3 className="text-xl font-bold text-white">{title}</h3>
                  <p className="text-slate-400 text-sm leading-relaxed">{body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ── Strategy comparison ───────────────────────────────────────── */}
        <section
          aria-labelledby="strategies-heading"
          className="py-24 px-4 sm:px-6 lg:px-8 bg-slate-900/40 border-y border-slate-800"
        >
          <div className="max-w-4xl mx-auto">
            <h2
              id="strategies-heading"
              className="text-3xl sm:text-4xl font-extrabold text-white text-center mb-4"
            >
              Choose your strategy
            </h2>
            <p className="text-slate-400 text-center mb-12 max-w-xl mx-auto">
              Pick the risk/reward balance that suits you. Your preference is
              stored on-chain and the AI follows it.
            </p>

            <div className="overflow-x-auto rounded-2xl border border-slate-800">
              <table className="min-w-full text-sm text-left">
                <caption className="sr-only">Strategy comparison table</caption>
                <thead className="bg-slate-900 text-slate-400 uppercase text-xs tracking-wider font-semibold">
                  <tr>
                    <th scope="col" className="px-6 py-4">Strategy</th>
                    <th scope="col" className="px-6 py-4">Target APY</th>
                    <th scope="col" className="px-6 py-4">Risk Level</th>
                    <th scope="col" className="px-6 py-4">How funds are deployed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 bg-slate-900/30">
                  {[
                    {
                      name: 'Conservative',
                      apy: '3–6%',
                      risk: 'Low',
                      riskColor: 'text-emerald-400',
                      description: 'Stablecoin lending on Blend Protocol',
                    },
                    {
                      name: 'Balanced',
                      apy: '6–10%',
                      risk: 'Medium',
                      riskColor: 'text-amber-400',
                      description: 'Mix of Blend lending + Stellar DEX liquidity',
                      highlight: true,
                    },
                    {
                      name: 'Growth',
                      apy: '10–15%',
                      risk: 'Higher',
                      riskColor: 'text-orange-400',
                      description: 'Aggressive multi-protocol deployment',
                    },
                  ].map(({ name, apy, risk, riskColor, description, highlight }) => (
                    <tr
                      key={name}
                      className={highlight ? 'bg-emerald-500/5 border-l-2 border-l-emerald-500' : ''}
                    >
                      <th scope="row" className="px-6 py-4 font-bold text-white">
                        {name}
                        {highlight && (
                          <span className="ml-2 text-[10px] uppercase font-extrabold tracking-wide bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                            Popular
                          </span>
                        )}
                      </th>
                      <td className="px-6 py-4 font-mono font-bold text-white">{apy}</td>
                      <td className={`px-6 py-4 font-semibold ${riskColor}`}>{risk}</td>
                      <td className="px-6 py-4 text-slate-400">{description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-8 text-center">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold px-8 py-3.5 rounded-full transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
              >
                Start Earning <ArrowRight size={18} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>

        {/* ── Security highlights ───────────────────────────────────────── */}
        <section
          aria-labelledby="security-heading"
          className="py-24 px-4 sm:px-6 lg:px-8"
        >
          <div className="max-w-5xl mx-auto">
            <h2
              id="security-heading"
              className="text-3xl sm:text-4xl font-extrabold text-white text-center mb-4"
            >
              Built for trust
            </h2>
            <p className="text-slate-400 text-center mb-16 max-w-xl mx-auto">
              Every design decision prioritises the safety of your funds.
            </p>

            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 list-none">
              {[
                {
                  icon: <Lock size={22} aria-hidden="true" />,
                  title: 'Non-Custodial',
                  body: 'Funds live in audited Soroban smart contracts. NeuroWealth never holds your keys or moves funds to arbitrary addresses.',
                },
                {
                  icon: <Shield size={22} aria-hidden="true" />,
                  title: 'Audited Contracts',
                  body: 'OpenZeppelin-equivalent patterns, strict CEI ordering to prevent reentrancy, and a 24-hour timelock on upgrades.',
                },
                {
                  icon: <TrendingUp size={22} aria-hidden="true" />,
                  title: 'Stellar Blockchain',
                  body: '3–5 second finality, sub-cent transaction fees, and native USDC — ideal for high-frequency AI-driven rebalancing.',
                },
                {
                  icon: <Zap size={22} aria-hidden="true" />,
                  title: 'Instant Withdrawals',
                  body: 'No lock-up periods, no withdrawal penalties. Redeem your shares at the current exchange rate at any time.',
                },
                {
                  icon: <Bot size={22} aria-hidden="true" />,
                  title: 'Two-Step Agent Rotation',
                  body: 'Changing the AI agent key requires a timelocked, two-step confirmation — preventing surprise agent substitution.',
                },
                {
                  icon: <Star size={22} aria-hidden="true" />,
                  title: 'Emergency Pause',
                  body: 'The owner can pause deposits and rebalances instantly. Withdrawals remain available even during a pause.',
                },
              ].map(({ icon, title, body }) => (
                <li
                  key={title}
                  className="flex flex-col gap-3 p-6 rounded-2xl border border-slate-800 bg-slate-900/50 hover:border-emerald-500/20 transition-colors"
                >
                  <span className="w-10 h-10 flex items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
                    {icon}
                  </span>
                  <h3 className="text-base font-bold text-white">{title}</h3>
                  <p className="text-slate-400 text-sm leading-relaxed">{body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── FAQ ──────────────────────────────────────────────────────── */}
        <section
          aria-labelledby="faq-heading"
          className="py-24 px-4 sm:px-6 lg:px-8 bg-slate-900/40 border-t border-slate-800"
        >
          <div className="max-w-2xl mx-auto">
            <h2
              id="faq-heading"
              className="text-3xl sm:text-4xl font-extrabold text-white text-center mb-12"
            >
              Frequently asked questions
            </h2>
            <div className="divide-y divide-slate-800 rounded-2xl border border-slate-800 px-6 bg-slate-900/50">
              {faqItems.map(({ q, a }) => (
                <FaqItem key={q} q={q} a={a} />
              ))}
            </div>
          </div>
        </section>

        {/* ── Final CTA ─────────────────────────────────────────────────── */}
        <section
          aria-labelledby="cta-heading"
          className="py-24 px-4 sm:px-6 lg:px-8 text-center"
        >
          <div className="max-w-3xl mx-auto">
            <h2
              id="cta-heading"
              className="text-3xl sm:text-5xl font-extrabold text-white mb-6"
            >
              Ready to put your USDC to work?
            </h2>
            <p className="text-slate-400 text-lg mb-10 max-w-xl mx-auto">
              Connect your Freighter wallet and start earning in under a minute.
              No lock-ups. No minimums beyond 1 USDC.
            </p>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold px-10 py-4 rounded-full text-lg transition-all shadow-[0_0_35px_-5px_rgba(16,185,129,0.5)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
            >
              Start Earning <ArrowRight size={20} aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-800/80 bg-[#06080e] py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 mb-10">
            {/* Brand */}
            <div className="lg:col-span-2">
              <div className="flex items-center gap-2 mb-3">
                <Bot size={20} className="text-emerald-400" aria-hidden="true" />
                <span className="font-extrabold text-white text-lg">NeuroWealth</span>
              </div>
              <p className="text-slate-400 text-sm leading-relaxed max-w-sm">
                AI-powered autonomous yield optimisation on the Stellar blockchain.
                Deposit once. Earn forever.
              </p>
              <div className="flex items-center gap-4 mt-4">
                <a
                  href="https://github.com/Shackole/NeuroWealth-Smartcontract"
                  target="_blank"
                  rel="noreferrer"
                  className="text-slate-500 hover:text-white transition-colors"
                  aria-label="GitHub repository"
                >
                  <Github size={20} aria-hidden="true" />
                </a>
                <a
                  href="https://twitter.com/neurowealth"
                  target="_blank"
                  rel="noreferrer"
                  className="text-slate-500 hover:text-white transition-colors"
                  aria-label="Twitter / X"
                >
                  <Twitter size={20} aria-hidden="true" />
                </a>
              </div>
            </div>

            {/* Product links */}
            <nav aria-label="Product navigation">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">
                Product
              </h3>
              <ul className="space-y-3 text-sm text-slate-400">
                <li>
                  <Link href="/dashboard" className="hover:text-white transition-colors">
                    Dashboard
                  </Link>
                </li>
                <li>
                  <Link href="/learn" className="hover:text-white transition-colors">
                    Learn
                  </Link>
                </li>
                <li>
                  <Link href="/stats" className="hover:text-white transition-colors">
                    Stats
                  </Link>
                </li>
              </ul>
            </nav>

            {/* Resources links */}
            <nav aria-label="Resources navigation">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">
                Resources
              </h3>
              <ul className="space-y-3 text-sm text-slate-400">
                <li>
                  <a
                    href="https://github.com/Shackole/NeuroWealth-Smartcontract/blob/main/SECURITY.md"
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-white transition-colors"
                  >
                    Security
                  </a>
                </li>
                <li>
                  <a
                    href="https://github.com/Shackole/NeuroWealth-Smartcontract"
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-white transition-colors"
                  >
                    GitHub
                  </a>
                </li>
                <li>
                  <a
                    href="https://stellar.org"
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-white transition-colors"
                  >
                    Stellar Network
                  </a>
                </li>
              </ul>
            </nav>
          </div>

          <div className="border-t border-slate-800 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
            <p>
              &copy; {new Date().getFullYear()} NeuroWealth Protocol. All rights reserved.
            </p>
            <p>
              Built on{' '}
              <a
                href="https://soroban.stellar.org"
                target="_blank"
                rel="noreferrer"
                className="hover:text-slate-300 transition-colors underline underline-offset-2"
              >
                Soroban / Stellar
              </a>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ─── Standalone APY counter (hero section) ────────────────────────────────────

function ApyCounter({ target }: { target: number }) {
  const [val, setVal] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || started.current) return;
        started.current = true;
        const start = performance.now();
        const tick = (now: number) => {
          const p = Math.min((now - start) / 1400, 1);
          const e = 1 - Math.pow(1 - p, 3);
          setVal(parseFloat((e * target).toFixed(1)));
          if (p < 1) requestAnimationFrame(tick);
          else setVal(target);
        };
        requestAnimationFrame(tick);
      },
      { threshold: 0.5 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [target]);

  return (
    <span
      ref={ref}
      className="text-4xl sm:text-5xl font-extrabold text-emerald-400 tabular-nums"
      aria-label={`${target}% APY`}
    >
      {val.toFixed(1)}%
    </span>
  );
}
