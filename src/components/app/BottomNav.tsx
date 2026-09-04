import { motion } from 'framer-motion';
import { Wallet, AtSign, ScanLine, TrendingUp, Settings, Activity } from 'lucide-react';

interface BottomNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  const tabs = [
    { id: 'wallet', icon: Wallet, label: 'Wallet' },
    { id: 'alias', icon: AtSign, label: 'Alias' },
    { id: 'scan', icon: ScanLine, label: 'Scan' },
    { id: 'insights', icon: TrendingUp, label: 'Insights' },
    { id: 'activity', icon: Activity, label: 'Activity' },
    { id: 'settings', icon: Settings, label: 'Settings' },
  ];

  return (
    <motion.nav
      initial={{ y: 100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="fixed bottom-0 left-0 right-0 z-50 min-w-0 md:hidden"
    >
      <div className="ri-bottom-safe mx-auto w-full min-w-0 max-w-2xl px-2 sm:px-6">
        <div className="w-full min-w-0 rounded-2xl border border-white/10 bg-white/5 px-1 py-2 shadow-[0_0_40px_rgba(0,0,0,0.5)] backdrop-blur-xl sm:p-4">
          <div className="flex w-full min-w-0 items-center">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className="group relative flex min-w-0 flex-1 flex-col items-center gap-1 px-1 py-2"
              >
                {activeTab === tab.id && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute inset-0 backdrop-blur-md bg-teal-400/10 border border-teal-400/30 rounded-xl"
                    transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                  />
                )}

                <tab.icon
                  className={`relative z-10 h-5 w-5 transition-colors sm:h-6 sm:w-6 ${
                    activeTab === tab.id ? 'text-teal-400' : 'text-gray-400 group-hover:text-gray-300'
                  }`}
                  strokeWidth={1.5}
                />

                <span
                  className={`relative z-10 max-w-full truncate text-[9px] font-semibold transition-colors min-[380px]:text-[10px] sm:text-xs ${
                    activeTab === tab.id ? 'text-teal-400' : 'text-gray-500 group-hover:text-gray-400'
                  }`}
                >
                  {tab.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </motion.nav>
  );
}
