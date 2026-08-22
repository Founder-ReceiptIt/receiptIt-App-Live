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
      <div className="max-w-2xl mx-auto px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="ri-bottom-dock border rounded-2xl px-1.5 py-2">
          <div className="flex items-center justify-between">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className="relative flex min-w-0 flex-1 flex-col items-center gap-1 px-1 py-2.5 group"
                aria-current={activeTab === tab.id ? 'page' : undefined}
              >
                {activeTab === tab.id && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute inset-0 bg-teal-400/10 border border-teal-400/30 rounded-xl"
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
                  className={`text-[10px] sm:text-xs relative z-10 transition-colors font-semibold ${
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
