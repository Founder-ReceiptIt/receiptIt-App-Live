import { motion } from 'framer-motion';
import { Wallet, AtSign, ScanLine, TrendingUp, Settings } from 'lucide-react';

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
    { id: 'settings', icon: Settings, label: 'Settings' },
  ];

  return (
    <motion.nav
      initial={{ y: 100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden"
    >
      <div className="max-w-2xl mx-auto px-6 pb-6">
        <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-4 shadow-[0_0_40px_rgba(0,0,0,0.5)]">
          <div className="flex items-center justify-between">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className="relative flex flex-col items-center gap-1 px-4 py-2 group"
              >
                {activeTab === tab.id && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute inset-0 backdrop-blur-md bg-teal-400/10 border border-teal-400/30 rounded-xl"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                  />
                )}

                <tab.icon
                  className={`w-6 h-6 relative z-10 transition-colors ${
                    activeTab === tab.id ? 'text-teal-400' : 'text-gray-400 group-hover:text-gray-300'
                  }`}
                  strokeWidth={1.5}
                />

                <span
                  className={`text-xs relative z-10 transition-colors font-semibold ${
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
