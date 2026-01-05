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
import { useAuth } from './contexts/AuthContext';

function App() {
  const { user, loading: authLoading } = useAuth();
  const [showApp, setShowApp] = useState(false);
  const [activeTab, setActiveTab] = useState('wallet');
  const [selectedReceipt, setSelectedReceipt] = useState<Receipt | null>(null);

  useEffect(() => {
    if (!authLoading && user) {
      const timer = setTimeout(() => {
        setShowApp(true);
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [authLoading, user]);

  if (authLoading) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <AuthForm />;
  }

  return (
    <div className="min-h-screen bg-black text-white font-mono overflow-x-hidden">
      <style>
        {`
          @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;600;700;800&display=swap');
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
                    <WalletTab onReceiptClick={setSelectedReceipt} />
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
                    <ScanTab />
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
                    <InsightsTab />
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
            <ReceiptModal receipt={selectedReceipt} onClose={() => setSelectedReceipt(null)} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;
