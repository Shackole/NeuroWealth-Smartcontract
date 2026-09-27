'use client';

import React, { useState } from 'react';
import { Bot, Sparkles, Menu, X } from 'lucide-react';
import { WalletConnect } from './WalletConnect';
import { LanguageSwitcher } from './LanguageSwitcher';

interface HeaderProps {
  publicKey: string | null;
  onConnect: () => void;
  onDisconnect: () => void;
}

export const Header: React.FC<HeaderProps> = ({ publicKey, onConnect, onDisconnect }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-800/80 bg-[#080b11]/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between gap-2">
        {/* Logo */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-indigo-600 p-0.5 shadow-glow-emerald flex items-center justify-center flex-shrink-0">
            <div className="h-full w-full bg-slate-950 rounded-[10px] flex items-center justify-center">
              <Bot className="text-emerald-400" size={20} />
            </div>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="font-bold text-lg sm:text-xl tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent truncate">
                NeuroWealth
              </span>
              <span className="hidden sm:flex text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 items-center gap-1 flex-shrink-0">
                <Sparkles size={10} /> AI Agent
              </span>
            </div>
            <p className="text-xs text-slate-400 hidden sm:block">Autonomous DeFi Yield on Stellar</p>
          </div>
        </div>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-300" aria-label="Main navigation">
          <a href="#dashboard" className="text-emerald-400 hover:text-emerald-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded px-1">Dashboard</a>
          <a href="#strategies" className="hover:text-emerald-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded px-1">Strategies</a>
          <a href="#history" className="hover:text-emerald-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded px-1">Transactions</a>
          <a href="#whatsapp" className="hover:text-emerald-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded px-1">WhatsApp Bot</a>
        </nav>

        {/* Right side: Language + Wallet + Hamburger */}
        <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
          <LanguageSwitcher />
          <WalletConnect publicKey={publicKey} onConnect={onConnect} onDisconnect={onDisconnect} />
          <button
            className="md:hidden p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-nav-menu"
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <nav
          id="mobile-nav-menu"
          className="md:hidden border-t border-slate-800/80 bg-[#080b11]/95 px-4 py-3 space-y-1"
          aria-label="Mobile navigation"
        >
          {[
            { href: '#dashboard', label: 'Dashboard' },
            { href: '#strategies', label: 'Strategies' },
            { href: '#history', label: 'Transactions' },
            { href: '#whatsapp', label: 'WhatsApp Bot' },
          ].map((item) => (
            <a
              key={item.href}
              href={item.href}
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center w-full text-sm font-medium text-slate-300 hover:text-emerald-400 py-3 px-2 rounded-lg hover:bg-slate-800/60 transition-colors min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              {item.label}
            </a>
          ))}
        </nav>
      )}
    </header>
  );
};
