import { useState, useEffect, useCallback, useRef } from 'react';
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
import { ActivityTab } from './components/app/ActivityTab';
import { AuthForm } from './components/auth/AuthForm';
import { AliasSetupModal } from './components/auth/AliasSetupModal';
import { ProfileRecoveryModal } from './components/auth/ProfileRecoveryModal';
import { CurrencySetupModal } from './components/auth/CurrencySetupModal';
import { ResetPasswordForm } from './components/auth/ResetPasswordForm';
import { Toast } from './components/app/Toast';
import { ToastProvider } from './contexts/ToastContext';
import { useAuth } from './contexts/AuthContext';
import { requestReceiptSectionCapture } from './lib/receiptCaptureUtils';
import { getShareTargetIntentId, recordShareTargetEvent } from './lib/shareTargetInbox';

const APP_TABS = ['wallet', 'alias', 'scan', 'insights', 'activity', 'settings'] as const;
type AppTab = typeof APP_TABS[number];

const getTabFromLocation = (): AppTab => {
  const tab = window.location.hash.replace(/^#/, '');
  return APP_TABS.includes(tab as AppTab) ? tab as AppTab : 'wallet';
};

function App() {
  const { user, session, loading: authLoading, profileLoading, needsAliasSetup, needsCurrencySetup, needsProfileRecovery, passwordRecoveryActive } = useAuth();
  const [showApp, setShowApp] = useState(false);
  const [activeTab, setActiveTab] = useState<AppTab>(() => getTabFromLocation());
  const [selectedReceipt, setSelectedReceipt] = useState<Receipt | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [quickScanRequestId, setQuickScanRequestId] = useState(0);
  const [requestedReceiptId, setRequestedReceiptId] = useState<string | null>(null);
  const recordedShareAuthInterruptionRef = useRef<string | null>(null);
  const isAuthenticated = Boolean(user && session);
  const shouldShowBootSplash = authLoading || profileLoading || (isAuthenticated && !needsAliasSetup && !showApp);

  const handleTabChange = useCallback((tab: string) => {
    if (!APP_TABS.includes(tab as AppTab)) return;

    const nextTab = tab as AppTab;
    if (window.location.hash !== `#${nextTab}`) {
      window.history.pushState({ tab: nextTab }, '', `#${nextTab}`);
    }
    setActiveTab(nextTab);
  }, []);

  const handleWalletReceiptsChange = useCallback((receipts: Receipt[]) => {
    setSelectedReceipt((currentReceipt) => {
      if (!currentReceipt) {
        return currentReceipt;
      }

      return receipts.find((receipt) => receipt.id === currentReceipt.id) || null;
    });
  }, []);

  const handleQuickScan = useCallback(() => {
    setQuickScanRequestId((currentRequestId) => currentRequestId + 1);
    handleTabChange('scan');
  }, [handleTabChange]);

  const handleQuickScanHandled = useCallback(() => {
    setQuickScanRequestId(0);
  }, []);

  const handleOpenReceiptFromActivity = useCallback((receiptId: string) => {
    setRequestedReceiptId(receiptId);
    handleTabChange('wallet');
  }, [handleTabChange]);

  const handleRequestedReceiptHandled = useCallback(() => {
    setRequestedReceiptId(null);
  }, []);

  useEffect(() => {
    const syncTabFromLocation = () => setActiveTab(getTabFromLocation());
    window.addEventListener('popstate', syncTabFromLocation);
    window.addEventListener('hashchange', syncTabFromLocation);

    return () => {
      window.removeEventListener('popstate', syncTabFromLocation);
      window.removeEventListener('hashchange', syncTabFromLocation);
    };
  }, []);

  useEffect(() => {
    const isScanning = localStorage.getItem('isScanning');
    if (isScanning === 'true' && user && session) {
      console.log('[App] Detected scanning flag in localStorage, forcing scan tab');
      window.history.replaceState({ tab: 'scan' }, '', '#scan');
      setActiveTab('scan');
    }
  }, [user, session]);

  useEffect(() => {
    const shareTargetId = getShareTargetIntentId();
    if (!shareTargetId || authLoading) return;

    if (user && session) {
      setActiveTab('scan');
      return;
    }

    if (recordedShareAuthInterruptionRef.current !== shareTargetId) {
      recordedShareAuthInterruptionRef.current = shareTargetId;
      void recordShareTargetEvent(shareTargetId, 'auth_interruption').catch(() => undefined);
    }
  }, [authLoading, user, session]);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (isAuthenticated && !needsAliasSetup) {
      console.log('[App] User authenticated, preparing app shell');
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

  useEffect(() => {
    // A selected receipt belongs to the current authenticated identity only.
    setSelectedReceipt(null);
    setRefreshKey((currentKey) => currentKey + 1);
  }, [user?.id]);

  if (passwordRecoveryActive && user && session) {
    return <ResetPasswordForm />;
  }

  if (!user || !session) {
    return <AuthForm />;
  }

  if (needsProfileRecovery) {
    return <ProfileRecoveryModal />;
  }

  if (needsCurrencySetup) {
    return <CurrencySetupModal />;
  }

  if (needsAliasSetup) {
    return <AliasSetupModal />;
  }

  return (
    <ToastProvider>
      <div className="ri-page-height min-w-0 overflow-x-clip bg-black font-mono text-white">
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
            key={`app-${user.id}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="ri-page-height min-w-0"
          >
            <TopNav activeTab={activeTab} onTabChange={handleTabChange} />

            <div className="ri-app-content min-w-0">
              <AnimatePresence mode="wait">
                {activeTab === 'wallet' && (
                  <motion.div
                    key="wallet"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ duration: 0.3 }}
                  >
                    <WalletTab
                      key={refreshKey}
                      onReceiptClick={setSelectedReceipt}
                      onReceiptsChange={handleWalletReceiptsChange}
                      onNavigateToScan={handleQuickScan}
                      onNavigateToAlias={() => handleTabChange('alias')}
                      requestedReceiptId={requestedReceiptId}
                      onRequestedReceiptHandled={handleRequestedReceiptHandled}
                    />
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
                    <ScanTab
                      onNavigateToWallet={() => handleTabChange('wallet')}
                      quickScanRequestId={quickScanRequestId}
                      onQuickScanHandled={handleQuickScanHandled}
                    />
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

                {activeTab === 'activity' && (
                  <motion.div
                    key="activity"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ duration: 0.3 }}
                  >
                    <ActivityTab onOpenReceipt={handleOpenReceiptFromActivity} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <BottomNav activeTab={activeTab} onTabChange={handleTabChange} />
            <ReceiptModal
              receipt={selectedReceipt?.userId === user.id ? selectedReceipt : null}
              onClose={() => setSelectedReceipt(null)}
              onDelete={() => setRefreshKey(prev => prev + 1)}
              onUpdate={() => setRefreshKey(prev => prev + 1)}
              onCaptureAgain={(inSections) => {
                if (inSections) requestReceiptSectionCapture();
                setSelectedReceipt(null);
                handleTabChange('scan');
              }}
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
