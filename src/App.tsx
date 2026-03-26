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
import { Toast } from './components/app/Toast';
import { ToastProvider } from './contexts/ToastContext';
import { useAuth } from './contexts/AuthContext';

function App() {
  const { user, loading: authLoading } = useAuth();
  const [showApp, setShowApp] = useState(false);
  const [activeTab, setActiveTab] = useState('wallet');
  const [selectedReceipt, setSelectedReceipt] = useState<Receipt | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // ANDROID FIX: Check if user was scanning when tab was killed
  useEffect(() => {
    const isScanning = localStorage.getItem('isScanning');
    if (isScanning === 'true') {
      console.log('[App] Detected scanning flag in localStorage, forcing scan tab');
      setActiveTab('scan');
    }
  }, []);

  useEffect(() => {
    if (!authLoading && user) {
      // Don't override activeTab if we're restoring scan state
      const isScanning = localStorage.getItem('isScanning');
      if (isScanning !== 'true') {
        setActiveTab('wallet');
      }
      const timer = setTimeout(() => {
        setShowApp(true);
      }, 2000);

      return () => clearTimeout(timer);
    } else if (!authLoading && !user) {
      setShowApp(false);
      setActiveTab('wallet');
    }
  }, [authLoading, user]);

  if (authLoading) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <AuthForm />;
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
        {!showApp ? (
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
