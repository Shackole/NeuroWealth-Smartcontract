import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { WalletProvider } from './context/WalletContext';
import { ToastProvider } from './context/ToastContext';
import Layout from './components/Layout';
import Home from './pages/Home';
import NotFound from './pages/NotFound';

// Chart-heavy dashboard is split out of the initial bundle so the core
// balance view can render without waiting for chart code to download.
const PortfolioDashboard = lazy(
  () => import('./components/PortfolioDashboard'),
);

function DashboardFallback() {
  return (
    <div className="dashboard-loading" role="status" aria-live="polite">
      Loading dashboard…
    </div>
  );
}

export default function App() {
  return (
    <WalletProvider>
      <ToastProvider>
        <BrowserRouter>
          <Layout>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route
                path="/dashboard"
                element={
                  <Suspense fallback={<DashboardFallback />}>
                    <PortfolioDashboard />
                  </Suspense>
                }
              />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Layout>
        </BrowserRouter>
      </ToastProvider>
    </WalletProvider>
  );
}
