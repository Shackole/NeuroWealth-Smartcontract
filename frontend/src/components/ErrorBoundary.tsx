'use client';

import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  /** The section name shown in the fallback UI (e.g. "Balance" or "Chart") */
  section?: string;
  /** Child nodes to protect */
  children: ReactNode;
  /** Optional custom fallback UI override */
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * ErrorBoundary — catches React render errors in a subtree and shows a
 * graceful fallback UI with a Reload button.
 *
 * Usage:
 *   <ErrorBoundary section="Portfolio Cards">
 *     <BalanceCard ... />
 *   </ErrorBoundary>
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // In a real app, report to Sentry here:
    // Sentry.captureException(error, { extra: info });
    console.error('[ErrorBoundary]', error, info);
  }

  private handleReload = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    const { hasError, error } = this.state;
    const { children, fallback, section } = this.props;

    if (!hasError) return children;
    if (fallback) return fallback;

    const sectionLabel = section ? `the ${section} section` : 'this section';

    return (
      <div
        role="alert"
        aria-live="assertive"
        className="glass-panel-interactive rounded-2xl p-8 flex flex-col items-center justify-center gap-4 text-center border border-yellow-500/20 min-h-[140px]"
      >
        <div className="h-12 w-12 rounded-full bg-yellow-500/10 flex items-center justify-center">
          <AlertTriangle className="text-yellow-400" size={24} aria-hidden="true" />
        </div>
        <div>
          <p className="font-semibold text-slate-900 dark:text-slate-200 mb-1">
            Something went wrong in {sectionLabel}
          </p>
          {error?.message && (
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto truncate">
              {error.message}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={this.handleReload}
          className="flex items-center gap-2 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 font-semibold px-5 py-2.5 rounded-xl border border-yellow-500/30 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-500"
          aria-label={`Reload ${sectionLabel}`}
        >
          <RefreshCw size={16} aria-hidden="true" />
          Reload
        </button>
      </div>
    );
  }
}
