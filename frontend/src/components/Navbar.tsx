'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Bot,
  Sparkles,
  Menu,
  X,
  LayoutDashboard,
  ArrowDownToLine,
  ArrowUpFromLine,
  Clock,
  BookOpen,
  Radio,
} from 'lucide-react';
import { WalletConnect } from './WalletConnect';
import { LanguageSwitcher } from './LanguageSwitcher';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NavbarProps {
  publicKey: string | null;
  onConnect: () => void;
  onDisconnect: () => void;
  isConnecting?: boolean;
  /** Pass 'Testnet' | 'Mainnet' — defaults to 'Testnet' */
  network?: 'Testnet' | 'Mainnet';
}

interface NavLink {
  label: string;
  href: string;
  icon: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Static nav links  (locale prefix is prepended at runtime)
// ---------------------------------------------------------------------------

const NAV_LINKS: NavLink[] = [
  { label: 'Dashboard', href: '/',        icon: <LayoutDashboard size={16} /> },
  { label: 'Deposit',   href: '/deposit', icon: <ArrowDownToLine  size={16} /> },
  { label: 'Withdraw',  href: '/withdraw',icon: <ArrowUpFromLine  size={16} /> },
  { label: 'History',   href: '/history', icon: <Clock            size={16} /> },
  { label: 'Docs',      href: '/docs',    icon: <BookOpen         size={16} /> },
];

// ---------------------------------------------------------------------------
// Helper — detect active link (accounts for /[locale]/... prefix)
// ---------------------------------------------------------------------------

function useIsActive(href: string): boolean {
  const pathname = usePathname();          // e.g. "/en", "/en/deposit"
  // Strip leading locale segment: /en/deposit → /deposit
  const stripped = pathname.replace(/^\/[a-z]{2}(-[A-Z]{2})?/, '') || '/';
  if (href === '/') return stripped === '/';
  return stripped.startsWith(href);
}

// ---------------------------------------------------------------------------
// Network badge
// ---------------------------------------------------------------------------

const NetworkBadge: React.FC<{ network: 'Testnet' | 'Mainnet' }> = ({ network }) => {
  const isMainnet = network === 'Mainnet';
  return (
    <span
      aria-label={`Network: ${network}`}
      className={[
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border select-none',
        isMainnet
          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
          : 'bg-amber-500/10 text-amber-400 border-amber-500/30',
      ].join(' ')}
    >
      <Radio size={10} className={isMainnet ? 'text-emerald-400' : 'text-amber-400'} />
      {network}
    </span>
  );
};

// ---------------------------------------------------------------------------
// Single desktop nav item
// ---------------------------------------------------------------------------

const DesktopNavItem: React.FC<{ link: NavLink; localePrefix: string }> = ({ link, localePrefix }) => {
  const active = useIsActive(link.href);
  const fullHref = link.href === '/' ? `${localePrefix}/` : `${localePrefix}${link.href}`;

  return (
    <Link
      href={fullHref}
      aria-current={active ? 'page' : undefined}
      className={[
        'flex items-center gap-1.5 text-sm font-medium transition-colors duration-150 relative pb-0.5',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:rounded',
        active
          ? 'text-emerald-400 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:rounded-full after:bg-emerald-400'
          : 'text-slate-300 hover:text-emerald-400',
      ].join(' ')}
    >
      {link.icon}
      {link.label}
    </Link>
  );
};

// ---------------------------------------------------------------------------
// Single mobile drawer nav item
// ---------------------------------------------------------------------------

const MobileNavItem: React.FC<{
  link: NavLink;
  localePrefix: string;
  onClose: () => void;
}> = ({ link, localePrefix, onClose }) => {
  const active = useIsActive(link.href);
  const fullHref = link.href === '/' ? `${localePrefix}/` : `${localePrefix}${link.href}`;

  return (
    <Link
      href={fullHref}
      onClick={onClose}
      aria-current={active ? 'page' : undefined}
      className={[
        'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500',
        active
          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
          : 'text-slate-300 hover:bg-slate-800/60 hover:text-emerald-400 border border-transparent',
      ].join(' ')}
    >
      <span className={active ? 'text-emerald-400' : 'text-slate-400'}>{link.icon}</span>
      {link.label}
    </Link>
  );
};

// ---------------------------------------------------------------------------
// Main Navbar
// ---------------------------------------------------------------------------

export const Navbar: React.FC<NavbarProps> = ({
  publicKey,
  onConnect,
  onDisconnect,
  isConnecting,
  network = 'Testnet',
}) => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();

  // Extract locale prefix from pathname: /en → /en, /en/deposit → /en
  const localePrefix = pathname.match(/^(\/[a-z]{2}(-[A-Z]{2})?)/)?.[1] ?? '/en';

  // Close drawer on route change
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // Close drawer on outside click
  useEffect(() => {
    if (!drawerOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        drawerRef.current &&
        !drawerRef.current.contains(e.target as Node) &&
        hamburgerRef.current &&
        !hamburgerRef.current.contains(e.target as Node)
      ) {
        setDrawerOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [drawerOpen]);

  // Trap focus inside drawer & close on Escape
  useEffect(() => {
    if (!drawerOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDrawerOpen(false);
        hamburgerRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [drawerOpen]);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [drawerOpen]);

  const toggleDrawer = useCallback(() => setDrawerOpen((v) => !v), []);

  return (
    <>
      {/* ------------------------------------------------------------------ */}
      {/* Main nav bar                                                         */}
      {/* ------------------------------------------------------------------ */}
      <header className="sticky top-0 z-50 w-full border-b border-slate-800/80 bg-[#080b11]/85 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between gap-4">

          {/* ---- Logo ---- */}
          <Link
            href={`${localePrefix}/`}
            className="flex items-center gap-3 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:rounded-lg"
            aria-label="NeuroWealth — go to dashboard"
          >
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-indigo-600 p-0.5 shadow-glow-emerald flex items-center justify-center">
              <div className="h-full w-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                <Bot className="text-emerald-400" size={22} />
              </div>
            </div>
            <div className="hidden sm:block">
              <div className="flex items-center gap-2">
                <span className="font-bold text-xl tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                  NeuroWealth
                </span>
                <span className="text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                  <Sparkles size={10} /> AI Agent
                </span>
              </div>
              <p className="text-xs text-slate-400">Autonomous DeFi Yield on Stellar</p>
            </div>
          </Link>

          {/* ---- Desktop nav links ---- */}
          <nav
            aria-label="Main navigation"
            className="hidden md:flex items-center gap-7"
          >
            {NAV_LINKS.map((link) => (
              <DesktopNavItem key={link.href} link={link} localePrefix={localePrefix} />
            ))}
          </nav>

          {/* ---- Right-side controls ---- */}
          <div className="flex items-center gap-3 shrink-0">
            {/* Network badge — hidden on very small screens */}
            <span className="hidden sm:inline-flex">
              <NetworkBadge network={network} />
            </span>

            {/* Language switcher */}
            <LanguageSwitcher />

            {/* Wallet button */}
            <WalletConnect
              publicKey={publicKey}
              onConnect={onConnect}
              onDisconnect={onDisconnect}
              isConnecting={isConnecting}
            />

            {/* Hamburger — visible only on mobile */}
            <button
              ref={hamburgerRef}
              onClick={toggleDrawer}
              aria-expanded={drawerOpen}
              aria-controls="mobile-drawer"
              aria-label={drawerOpen ? 'Close navigation menu' : 'Open navigation menu'}
              className="md:hidden flex items-center justify-center h-10 w-10 rounded-lg border border-slate-700 text-slate-300 hover:text-emerald-400 hover:border-emerald-500/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              {drawerOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* Mobile drawer backdrop                                               */}
      {/* ------------------------------------------------------------------ */}
      <div
        aria-hidden="true"
        onClick={() => setDrawerOpen(false)}
        className={[
          'fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden transition-opacity duration-300',
          drawerOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        ].join(' ')}
      />

      {/* ------------------------------------------------------------------ */}
      {/* Mobile slide-in drawer                                               */}
      {/* ------------------------------------------------------------------ */}
      <div
        id="mobile-drawer"
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        className={[
          'fixed top-0 right-0 z-50 h-full w-[280px] md:hidden',
          'flex flex-col bg-[#080b11] border-l border-slate-800',
          'shadow-2xl transition-transform duration-300 ease-in-out',
          drawerOpen ? 'translate-x-0' : 'translate-x-full',
        ].join(' ')}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-5 h-20 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-emerald-500 to-indigo-600 p-0.5 flex items-center justify-center">
              <div className="h-full w-full bg-slate-950 rounded-md flex items-center justify-center">
                <Bot className="text-emerald-400" size={16} />
              </div>
            </div>
            <span className="font-bold text-base tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
              NeuroWealth
            </span>
          </div>
          <button
            onClick={() => setDrawerOpen(false)}
            aria-label="Close navigation menu"
            className="flex items-center justify-center h-9 w-9 rounded-lg border border-slate-700 text-slate-400 hover:text-emerald-400 hover:border-emerald-500/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <X size={18} />
          </button>
        </div>

        {/* Drawer body */}
        <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 px-4 mb-2">
            Navigation
          </p>
          {NAV_LINKS.map((link) => (
            <MobileNavItem
              key={link.href}
              link={link}
              localePrefix={localePrefix}
              onClose={() => setDrawerOpen(false)}
            />
          ))}
        </div>

        {/* Drawer footer — network + wallet */}
        <div className="px-4 py-5 border-t border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">Network</span>
            <NetworkBadge network={network} />
          </div>
          <WalletConnect
            publicKey={publicKey}
            onConnect={() => { onConnect(); setDrawerOpen(false); }}
            onDisconnect={onDisconnect}
            isConnecting={isConnecting}
          />
        </div>
      </div>
    </>
  );
};
