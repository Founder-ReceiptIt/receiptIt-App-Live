import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LoadingScreen } from './components/landing/LoadingScreen';
import { TopNav } from './components/app/TopNav';
import { BottomNav } from './components/app/BottomNav';
import { WalletTab, Receipt } from './components/app/WalletTab';
import { AliasTab } from './components/app/AliasTab';
import { ScanTab } from './components/app/ScanTab';
import { ReceiptModal } from './components/app/ReceiptModal';
import { InsightsTab } from './components/app/InsightsTab';
import { SettingsTab } from './components/app/SettingsTab';
import { AuthForm } from './components/auth/AuthForm';
import { AliasSetupModal } from './components/auth/AliasSetupModal';
import { Toast } from './components/app/Toast';
import { ToastProvider } from './contexts/ToastContext';
import { useAuth } from './contexts/AuthContext';

function App() {
  const { user, session, loading: authLoading, needsAliasSetup } = useAuth();
  const [showApp, setShowApp] = useState(false);
  const [activeTab, setActiveTab] = useState('wallet');
  const [selectedReceipt, setSelectedReceipt] = useState<Receipt | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const isAuthenticated = Boolean(user && session);
  const shouldShowBootSplash = authLoading || (isAuthenticated && !needsAliasSetup && !showApp);

  useEffect(() => {
    const isScanning = localStorage.getItem('isScanning');
    if (isScanning === 'true' && user && session) {
      console.log('[App] Detected scanning flag in localStorage, forcing scan tab');
      setActiveTab('scan');
    }
  }, [user, session]);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (isAuthenticated && !needsAliasSetup) {
      console.log('[App] User authenticated, preparing app shell');
      const isScanning = localStorage.getItem('isScanning');
      if (isScanning !== 'true') {
        setActiveTab('wallet');
      }
      if (showApp) {
        return;
      }

      const timer = setTimeout(() => {
        setShowApp(true);
      }, 2000);

      return () => clearTimeout(timer);
    }

    console.log('[App] App shell not ready - resetting splash state');
    setShowApp(false);
    if (!isAuthenticated) {
      setActiveTab('wallet');
    }
  }, [authLoading, isAuthenticated, needsAliasSetup, showApp, user, session]);

  if (!user || !session) {
    return <AuthForm />;
  }

  if (needsAliasSetup) {
    return <AliasSetupModal />;
  }

  return (
    <ToastProvider>
      <div className="min-h-screen bg-black text-white font-mono overflow-x-hidden">
      <style>
        {`
          * {
            font-family: 'JetBrains Mono', monospace !important;
          }
        `}
      </style>

      <AnimatePresence mode="wait">
        {shouldShowBootSplash ? (
          <motion.div
            key="loading"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <LoadingScreen />
          </motion.div>
        ) : (
          <motion.div
            key="app"
            initial={{ opacity: 0, scale: 1.05 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="min-h-screen"
          >
            <TopNav activeTab={activeTab} onTabChange={setActiveTab} />

            <div className="pt-20">
              <AnimatePresence mode="wait">
                {activeTab === 'wallet' && (
                  <motion.div
                    key="wallet"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ duration: 0.3 }}
                  >
                    <WalletTab key={refreshKey} onReceiptClick={setSelectedReceipt} />
                  </motion.div>
                )}

                {activeTab === 'alias' && (
                  <motion.div
                    key="alias"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ duration: 0.3 }}
                  >
                    <AliasTab />
                  </motion.div>
                )}

                {activeTab === 'scan' && (
                  <motion.div
                    key="scan"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ duration: 0.3 }}
                  >
                    <ScanTab onNavigateToWallet={() => setActiveTab('wallet')} />
                  </motion.div>
                )}

                {activeTab === 'insights' && (
                  <motion.div
                    key="insights"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ duration: 0.3 }}
                  >
                    <InsightsTab key={refreshKey} />
                  </motion.div>
                )}

                {activeTab === 'settings' && (
                  <motion.div
                    key="settings"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ duration: 0.3 }}
                  >
                    <SettingsTab />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
            <ReceiptModal
              receipt={selectedReceipt}
              onClose={() => setSelectedReceipt(null)}
              onDelete={() => setRefreshKey(prev => prev + 1)}
            />
          </motion.div>
        )}
      </AnimatePresence>
      <Toast />
      </div>
    </ToastProvider>
  );
}

export default App;
