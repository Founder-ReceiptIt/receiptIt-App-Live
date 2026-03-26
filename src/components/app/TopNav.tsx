import { motion, AnimatePresence } from 'framer-motion';
import { Wallet, AtSign, ScanLine, TrendingUp, Settings, Menu, X, User } from 'lucide-react';
import { useState } from 'react';

interface TopNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export function TopNav({ activeTab, onTabChange }: TopNavProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const tabs = [
    { id: 'wallet', icon: Wallet, label: 'Wallet' },
    { id: 'alias', icon: AtSign, label: 'Alias' },
    { id: 'scan', icon: ScanLine, label: 'Scan' },
    { id: 'insights', icon: TrendingUp, label: 'Insights' },
  ];

  const handleTabChange = (tab: string) => {
    onTabChange(tab);
    setIsMobileMenuOpen(false);
  };

  return (
    <motion.nav
      initial={{ y: -100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-black/50 border-b border-white/10"
    >
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Logo - Left Side */}
          <motion.div
            whileHover={{ scale: 1.05 }}
            className="text-2xl font-bold font-mono tracking-tight cursor-pointer"
            onClick={() => onTabChange('wallet')}
          >
            <span className="text-white">receipt</span>
            <span className="text-teal-400">It</span>
          </motion.div>

          {/* Desktop Navigation Links - Right Side */}
          <div className="hidden md:flex items-center gap-6">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className="relative group"
              >
                <div className="flex items-center gap-2 px-4 py-2 rounded-lg transition-colors">
                  <tab.icon
                    className={`w-5 h-5 transition-colors ${
                      activeTab === tab.id ? 'text-teal-400' : 'text-gray-400 group-hover:text-white'
                    }`}
                    strokeWidth={1.5}
                  />
                  <span
                    className={`text-sm font-semibold transition-colors ${
                      activeTab === tab.id ? 'text-teal-400' : 'text-gray-400 group-hover:text-white'
                    }`}
                  >
                    {tab.label}
                  </span>
                </div>
                {activeTab === tab.id && (
                  <motion.div
                    layoutId="activeIndicator"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal-400"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                  />
                )}
              </button>
            ))}

            {/* Settings/Profile */}
            <button
              onClick={() => onTabChange('settings')}
              className={`p-2 rounded-lg transition-colors ${
                activeTab === 'settings'
                  ? 'bg-teal-400/10 text-teal-400'
                  : 'text-gray-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Settings className="w-5 h-5" strokeWidth={1.5} />
            </button>
          </div>

          {/* Mobile Hamburger Menu */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden p-2 rounded-lg text-gray-400 hover:bg-white/5 hover:text-white transition-colors"
          >
            {isMobileMenuOpen ? (
              <X className="w-6 h-6" strokeWidth={1.5} />
            ) : (
              <Menu className="w-6 h-6" strokeWidth={1.5} />
            )}
          </button>
        </div>

        {/* Mobile Menu Dropdown */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              className="md:hidden overflow-hidden"
            >
              <div className="pt-4 pb-2 space-y-2">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => handleTabChange(tab.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                      activeTab === tab.id
                        ? 'bg-teal-400/10 text-teal-400 border border-teal-400/30'
                        : 'text-gray-400 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <tab.icon className="w-5 h-5" strokeWidth={1.5} />
                    <span className="text-sm font-semibold">{tab.label}</span>
                  </button>
                ))}
                <button
                  onClick={() => handleTabChange('settings')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    activeTab === 'settings'
                      ? 'bg-teal-400/10 text-teal-400 border border-teal-400/30'
                      : 'text-gray-400 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <Settings className="w-5 h-5" strokeWidth={1.5} />
                  <span className="text-sm font-semibold">Settings</span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.nav>
  );
}
