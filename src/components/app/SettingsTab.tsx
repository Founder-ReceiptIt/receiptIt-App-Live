import { motion } from 'framer-motion';
import {
  Download,
  FileText,
  Bell,
  Lock,
  Mail,
  Trash2,
  Shield,
  Smartphone,
  Globe,
  Eye,
  ChevronRight,
  Check
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

export function SettingsTab() {
  const { user, username, emailAlias, signOut } = useAuth();
  const [receiptsCount, setReceiptsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState({
    receiptCaptured: true,
    warrantyExpiring: true,
    budgetAlerts: true,
    securityAlerts: true,
  });

  const [privacy, setPrivacy] = useState({
    autoDelete: true,
    analyticsSharing: false,
  });

  useEffect(() => {
    if (!user) return;

    const fetchUserData = async () => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('receipts_captured')
        .eq('user_id', user.id)
        .maybeSingle();

      if (profile) {
        setReceiptsCount(profile.receipts_captured);
      }
      setLoading(false);
    };

    fetchUserData();
  }, [user]);

  const handleExport = (format: 'csv' | 'xero') => {
    const message = format === 'csv'
      ? 'Downloading CSV export...'
      : 'Preparing Xero-compatible export...';
    alert(message);
  };

  const handleSignOut = async () => {
    await signOut();
  };

  const settingsSections = [
    {
      title: 'Export & Integrations',
      icon: Download,
      items: [
        {
          icon: FileText,
          title: 'Download CSV',
          description: 'Export all receipts and transactions',
          action: () => handleExport('csv'),
          actionText: 'Download',
          color: 'text-blue-400'
        },
        {
          icon: FileText,
          title: 'Xero Integration',
          description: 'Export in Xero-compatible format',
          action: () => handleExport('xero'),
          actionText: 'Download',
          color: 'text-cyan-400'
        },
      ]
    },
    {
      title: 'Notifications',
      icon: Bell,
      items: [
        {
          icon: Mail,
          title: 'Receipt Captured',
          description: 'Notify when new receipts are processed',
          toggle: true,
          value: notifications.receiptCaptured,
          onChange: (val: boolean) => setNotifications({...notifications, receiptCaptured: val})
        },
        {
          icon: Shield,
          title: 'Warranty Expiring',
          description: 'Alerts 30 days before warranty ends',
          toggle: true,
          value: notifications.warrantyExpiring,
          onChange: (val: boolean) => setNotifications({...notifications, warrantyExpiring: val})
        },
        {
          icon: Bell,
          title: 'Budget Alerts',
          description: 'Warning when approaching spending limit',
          toggle: true,
          value: notifications.budgetAlerts,
          onChange: (val: boolean) => setNotifications({...notifications, budgetAlerts: val})
        },
        {
          icon: Lock,
          title: 'Security Alerts',
          description: 'Suspicious activity notifications',
          toggle: true,
          value: notifications.securityAlerts,
          onChange: (val: boolean) => setNotifications({...notifications, securityAlerts: val})
        },
      ]
    },
    {
      title: 'Privacy & Security',
      icon: Lock,
      items: [
        {
          icon: Trash2,
          title: 'Auto-Delete Emails',
          description: 'Remove emails after retention period',
          toggle: true,
          value: privacy.autoDelete,
          onChange: (val: boolean) => setPrivacy({...privacy, autoDelete: val})
        },
        {
          icon: Eye,
          title: 'Analytics Sharing',
          description: 'Help improve receiptIt with usage data',
          toggle: true,
          value: privacy.analyticsSharing,
          onChange: (val: boolean) => setPrivacy({...privacy, analyticsSharing: val})
        },
      ]
    },
  ];

  return (
    <div className="pb-32 px-6 pt-8 max-w-7xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">Settings</h1>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6 mb-6"
        >
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-teal-400/20 to-cyan-400/20 border border-teal-400/30 flex items-center justify-center">
              <Shield className="w-8 h-8 text-teal-400" strokeWidth={1.5} />
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-bold text-white mb-1">
                {loading ? 'Loading...' : emailAlias || 'Not set'}
              </h3>
              <p className="text-gray-400 text-sm mb-3">Your privacy-protected alias</p>
              <div className="flex flex-col gap-2">
                <div className="text-sm text-gray-400">
                  Username: <span className="text-white font-semibold">{username || 'Not set'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border backdrop-blur-md text-green-400 bg-green-400/10 border-green-400/30">
                    <Check className="w-3 h-3" />
                    Active
                  </div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border backdrop-blur-md text-gray-400 bg-white/5 border-white/10">
                    {receiptsCount} receipts captured
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        <div className="space-y-6">
          {settingsSections.map((section, sectionIndex) => (
            <motion.div
              key={sectionIndex}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 + sectionIndex * 0.1 }}
              className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl overflow-hidden"
            >
              <div className="p-4 border-b border-white/10 flex items-center gap-2">
                <section.icon className="w-5 h-5 text-teal-400" strokeWidth={1.5} />
                <h2 className="text-lg font-bold text-white">{section.title}</h2>
              </div>

              <div className="divide-y divide-white/10">
                {section.items.map((item, itemIndex) => (
                  <div
                    key={itemIndex}
                    className="p-4 hover:bg-white/5 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center ${item.color || 'text-gray-400'}`}>
                        <item.icon className="w-5 h-5" strokeWidth={1.5} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <h3 className="text-white font-semibold mb-0.5">{item.title}</h3>
                        <p className="text-sm text-gray-400">{item.description}</p>
                      </div>

                      {item.toggle ? (
                        <button
                          onClick={() => item.onChange?.(!item.value)}
                          className={`relative w-12 h-7 rounded-full transition-colors ${
                            item.value ? 'bg-teal-400' : 'bg-white/10'
                          }`}
                        >
                          <motion.div
                            animate={{ x: item.value ? 20 : 2 }}
                            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                            className={`absolute top-1 w-5 h-5 rounded-full ${
                              item.value ? 'bg-black' : 'bg-white/50'
                            }`}
                          />
                        </button>
                      ) : item.action ? (
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={item.action}
                          className="px-4 py-2 rounded-lg bg-teal-400/20 border border-teal-400/30 text-teal-400 font-semibold text-sm hover:bg-teal-400/30 transition-colors"
                        >
                          {item.actionText}
                        </motion.button>
                      ) : (
                        <ChevronRight className="w-5 h-5 text-gray-500" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.6 }}
          className="mt-6 backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl overflow-hidden"
        >
          <div className="p-4 border-b border-white/10 flex items-center gap-2">
            <Globe className="w-5 h-5 text-teal-400" strokeWidth={1.5} />
            <h2 className="text-lg font-bold text-white">About</h2>
          </div>

          <div className="p-6 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Version</span>
              <span className="text-white font-mono">v1.0.0</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Platform</span>
              <span className="text-white font-mono">Web</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Last Sync</span>
              <span className="text-white font-mono">Just now</span>
            </div>
          </div>

          <div className="p-4 border-t border-white/10 space-y-2">
            <button className="w-full text-left px-4 py-3 rounded-lg hover:bg-white/5 transition-colors text-gray-400 hover:text-white">
              Privacy Policy
            </button>
            <button className="w-full text-left px-4 py-3 rounded-lg hover:bg-white/5 transition-colors text-gray-400 hover:text-white">
              Terms of Service
            </button>
            <button className="w-full text-left px-4 py-3 rounded-lg hover:bg-white/5 transition-colors text-gray-400 hover:text-white">
              Help & Support
            </button>
            <button
              onClick={handleSignOut}
              className="w-full text-left px-4 py-3 rounded-lg hover:bg-white/5 transition-colors text-red-400 hover:text-red-300"
            >
              Sign Out
            </button>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
