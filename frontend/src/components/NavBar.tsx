'use client';

import React, { useState } from 'react';
import { Bot, Wallet, LogOut, Menu, X } from 'lucide-react';
import { shortenAddress } from '@/lib/stellar';

export interface NavBarProps {
  publicKey?: string | null;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

export const NavBar: React.FC<NavBarProps> = ({
  publicKey,
  onConnect,
  onDisconnect
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 w-full backdrop-blur-md bg-[#080b11]/80 border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center shadow-glow-emerald">
              <Bot className="text-slate-950" size={24} aria-hidden="true" />
            </div>
            <div>
              <span className="text-lg font-bold text-white tracking-tight flex items-center gap-1.5">
                NeuroWealth
                <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  AI Vault
                </span>
              </span>
            </div>
          </div>

          {/* Desktop Navigation */}
          <nav aria-label="Main Navigation" className="hidden md:flex items-center gap-6">
            <a
              href="#dashboard"
              className="text-sm font-medium text-slate-300 hover:text-white transition-colors focus:outline-none focus:text-emerald-400"
            >
              Dashboard
            </a>
            <a
              href="#strategies"
              className="text-sm font-medium text-slate-300 hover:text-white transition-colors focus:outline-none focus:text-emerald-400"
            >
              Strategies
            </a>
            <a
              href="#history"
              className="text-sm font-medium text-slate-300 hover:text-white transition-colors focus:outline-none focus:text-emerald-400"
            >
              History
            </a>
            <a
              href="#whatsapp"
              className="text-sm font-medium text-slate-300 hover:text-white transition-colors focus:outline-none focus:text-emerald-400"
            >
              WhatsApp
            </a>
          </nav>

          {/* Wallet Actions */}
          <div className="hidden sm:flex items-center gap-3">
            {publicKey ? (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-full font-mono text-xs text-emerald-400">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true" />
                  <span aria-label={`Connected wallet ${publicKey}`}>
                    {shortenAddress(publicKey, 4)}
                  </span>
                </div>
                <button
                  onClick={onDisconnect}
                  aria-label="Disconnect wallet"
                  className="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-900 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-rose-400"
                >
                  <LogOut size={16} aria-hidden="true" />
                </button>
              </div>
            ) : (
              <button
                onClick={onConnect}
                aria-label="Connect Freighter Wallet"
                className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-4 py-2 rounded-full text-xs transition-all shadow-glow-emerald focus:outline-none focus:ring-2 focus:ring-emerald-400"
              >
                <Wallet size={14} aria-hidden="true" />
                <span>Connect Wallet</span>
              </button>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="flex md:hidden">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle navigation menu"
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-menu"
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 focus:outline-none"
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div id="mobile-menu" className="md:hidden border-b border-slate-800 bg-[#080b11] px-4 pt-2 pb-4 space-y-2">
          <nav aria-label="Mobile Navigation" className="flex flex-col space-y-2">
            <a
              href="#dashboard"
              onClick={() => setMobileMenuOpen(false)}
              className="text-sm font-medium text-slate-300 hover:text-white py-1"
            >
              Dashboard
            </a>
            <a
              href="#strategies"
              onClick={() => setMobileMenuOpen(false)}
              className="text-sm font-medium text-slate-300 hover:text-white py-1"
            >
              Strategies
            </a>
            <a
              href="#history"
              onClick={() => setMobileMenuOpen(false)}
              className="text-sm font-medium text-slate-300 hover:text-white py-1"
            >
              History
            </a>
          </nav>
          <div className="pt-2 border-t border-slate-800">
            {publicKey ? (
              <button
                onClick={() => {
                  if (onDisconnect) onDisconnect();
                  setMobileMenuOpen(false);
                }}
                className="w-full text-left text-xs text-rose-400 font-mono py-1"
              >
                Disconnect ({shortenAddress(publicKey)})
              </button>
            ) : (
              <button
                onClick={() => {
                  if (onConnect) onConnect();
                  setMobileMenuOpen(false);
                }}
                className="w-full bg-emerald-500 text-slate-950 font-bold py-2 rounded-lg text-xs"
              >
                Connect Wallet
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
