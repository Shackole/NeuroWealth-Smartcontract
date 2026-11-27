import { useState } from 'react';
import DepositWithdrawModal from './components/DepositWithdrawModal';
import EarningsHistoryPage from './components/EarningsHistoryPage';
import NotificationSettings from './components/NotificationSettings';

type AppView = 'modal' | 'earnings' | 'notifications';

const NAV: { id: AppView; label: string }[] = [
  { id: 'modal', label: 'Deposit / Withdraw' },
  { id: 'earnings', label: 'Earnings History' },
  { id: 'notifications', label: 'Notifications' },
];

export default function App() {
  const [view, setView] = useState<AppView>('modal');

  return (
    <div className="min-h-screen bg-vault-canvas text-vault-text">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <header className="bg-vault-surface shadow-sm border-b border-vault-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-vault-text">NeuroWealth Vault</h1>
            </div>
            <nav className="flex items-center gap-2" aria-label="Primary">
              {NAV.map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setView(item.id)}
                  aria-current={view === item.id ? 'page' : undefined}
                  className={`px-4 py-2 rounded-md text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vault-accent ${
                    view === item.id
                      ? 'bg-vault-accent-soft text-vault-accent'
                      : 'text-vault-muted hover:text-vault-text'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </nav>
          </div>
        </div>
      </header>

      <main id="main-content" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8" tabIndex={-1}>
        {view === 'modal' && <DepositWithdrawModal />}
        {view === 'earnings' && <EarningsHistoryPage />}
        {view === 'notifications' && <NotificationSettings />}
      </main>
    </div>
  );
}
