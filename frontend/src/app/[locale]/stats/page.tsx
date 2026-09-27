'use client';

import React from 'react';
import { Header } from '@/components/Header';
import { TrendingUp, DollarSign, Activity, Users } from 'lucide-react';

export default function StatsPage() {
  const protocolMetrics = [
    { label: 'Total Value Locked (TVL)', value: '$1,250,450.00', change: '+12.4%', icon: DollarSign },
    { label: 'Current Net APY', value: '8.40%', change: '+0.6%', icon: TrendingUp },
    { label: 'Active Vault Users', value: '1,420', change: '+85 this week', icon: Users },
    { label: 'Automated Rebalances (24h)', value: '48', change: '100% success', icon: Activity },
  ];

  const allocations = [
    { protocol: 'Blend Lending Pool', allocation: '55.0%', deployed: '$687,747.50', apy: '7.8%' },
    { protocol: 'Soroswap AMM Pool', allocation: '30.0%', deployed: '$375,135.00', apy: '9.6%' },
    { protocol: 'Phoenix DEX', allocation: '10.0%', deployed: '$125,045.00', apy: '8.1%' },
    { protocol: 'Idle Vault Reserves', allocation: '5.0%', deployed: '$62,522.50', apy: '0.0%' },
  ];

  return (
    <div className="min-h-screen bg-[#080b11] text-slate-100 flex flex-col justify-between">
      <Header
        publicKey="GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"
        onConnect={() => {}}
        onDisconnect={() => {}}
      />

      <main id="main-content" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 flex-1">
        <header className="space-y-2">
          <h1 className="text-3xl font-extrabold tracking-tight text-white">Protocol Statistics</h1>
          <p className="text-slate-400">
            Real-time on-chain metrics, smart contract reserve health, and DeFi allocation breakdown.
          </p>
        </header>

        <section aria-labelledby="key-metrics-heading">
          <h2 id="key-metrics-heading" className="sr-only">Key Protocol Metrics</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {protocolMetrics.map((m) => {
              const Icon = m.icon;
              return (
                <div key={m.label} className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="text-xs font-semibold uppercase tracking-wider">{m.label}</span>
                    <Icon size={18} className="text-emerald-400" aria-hidden="true" />
                  </div>
                  <div className="text-2xl font-bold text-white font-mono">{m.value}</div>
                  <div className="text-xs font-medium text-emerald-400">{m.change}</div>
                </div>
              );
            })}
          </div>
        </section>

        <section aria-labelledby="allocations-heading" className="space-y-4">
          <h2 id="allocations-heading" className="text-xl font-bold text-white">Strategy Allocations & Reserves</h2>
          <div className="glass-panel rounded-2xl border border-slate-800 overflow-hidden">
            <table className="min-w-full divide-y divide-slate-800 text-left text-sm">
              <caption className="sr-only">Detailed breakdown of protocol funds by yield venue</caption>
              <thead className="bg-slate-900/80 text-slate-300 font-semibold text-xs uppercase tracking-wider">
                <tr>
                  <th scope="col" className="px-6 py-4">Protocol / Venue</th>
                  <th scope="col" className="px-6 py-4">Allocation Share</th>
                  <th scope="col" className="px-6 py-4">Deployed Assets</th>
                  <th scope="col" className="px-6 py-4">Current Venue APY</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-200">
                {allocations.map((row) => (
                  <tr key={row.protocol} className="hover:bg-slate-900/40">
                    <th scope="row" className="px-6 py-4 font-medium text-white">{row.protocol}</th>
                    <td className="px-6 py-4 font-mono">{row.allocation}</td>
                    <td className="px-6 py-4 font-mono">{row.deployed}</td>
                    <td className="px-6 py-4 font-mono text-emerald-400">{row.apy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-800/60 py-6 text-center text-xs text-slate-500">
        <p>&copy; {new Date().getFullYear()} NeuroWealth Protocol. WCAG 2.1 AA Compliant.</p>
      </footer>
    </div>
  );
}
