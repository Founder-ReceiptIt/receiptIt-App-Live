import { motion } from 'framer-motion';
import {
  FileText,
  Trash2,
  Shield,
  Globe,
  AlertTriangle,
  X,
  ShieldCheck,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';

type SettingsActionItem = {
  icon: LucideIcon;
  title: string;
  description: string;
  action: () => void | Promise<void>;
  actionText: string;
  color?: string;
};

type SettingsToggleItem = {
  icon: LucideIcon;
  title: string;
  description: string;
  toggle: true;
  value: boolean;
  onChange: (value: boolean) => void;
  color?: string;
};

type SettingsSection = {
  title: string;
  icon: LucideIcon;
  items: Array<SettingsActionItem | SettingsToggleItem>;
};

export function SettingsTab() {
  const {
    user,
    username,
    fullName,
    signOut,
    profileLoading,
    deleteAccount,
  } = useAuth();
  const { showToast } = useToast();

  const getDisplayName = () => {
    const isSystemLikeName = (value: string) => (
      /^ri-[a-f0-9]{16,}$/i.test(value) || /^[a-f0-9]{24,}$/i.test(value)
    );
    if (fullName && !isSystemLikeName(fullName.trim())) return fullName.trim();
    if (username && !isSystemLikeName(username.trim())) return username.trim();
    return 'Private account';
  };
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);


  const handleExport = async () => {
    if (!user) return;

    const { data: receipts, error } = await supabase
      .from('receipts')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error || !receipts) return;

    const headers = [
      'Status',
      'Document type',
      'Date',
      'Merchant',
      'Amount',
      'Currency',
      'Category',
      'Reference',
      'Original available',
    ];
    const rows = receipts.map(r => [
      r.status || '',
      r.document_type || '',
      r.transaction_date,
      r.merchant,
      r.amount,
      r.currency,
      r.category || '',
      r.reference_number || '',
      r.storage_path ? 'Yes' : 'No',
    ]);

    const csvCell = (value: unknown) => {
      const rawValue = String(value ?? '');
      // Avoid formula execution when an export is opened in spreadsheet apps.
      const safeValue = /^[=+\-@]/.test(rawValue) ? `'${rawValue}` : rawValue;
      return `"${safeValue.replace(/"/g, '""')}"`;
    };
    const csv = [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `receipts-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSignOut = async () => {
    await signOut();
  };

  const handleDeleteAccount = async () => {
    setDeleteLoading(true);
    const { error } = await deleteAccount();
    setDeleteLoading(false);

    if (error) {
      showToast(error.message || 'Failed to delete account');
    } else {
      showToast('Account deleted successfully');
      setShowDeleteModal(false);
    }
  };

  const settingsSections: SettingsSection[] = [
    {
      title: 'Privacy & security',
      icon: ShieldCheck,
      items: [
        {
          icon: Shield,
          title: 'Your data is private',
          description: 'Your receipts and purchase data are private to your account.',
          action: () => showToast('Your receipts and purchase data are private to your account.'),
          actionText: 'Details',
          color: 'text-teal-400'
        },
        {
          icon: FileText,
          title: 'Download your data',
          description: 'Export your saved receipts as a CSV file.',
          action: handleExport,
          actionText: 'Download',
          color: 'text-blue-400'
        },
        {
          icon: Trash2,
          title: 'Delete account',
          description: 'Permanently deletes your account and saved receipts.',
          action: () => setShowDeleteModal(true),
          actionText: 'Delete',
          color: 'text-red-400'
        },
      ]
    },
  ];

  return (
    <main className="ri-page" aria-label="Settings">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="mb-8">
          <h1 className="ri-page-heading text-3xl font-bold text-white sm:text-4xl">Settings</h1>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="ri-surface p-6 mb-6"
        >
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-teal-400/20 to-cyan-400/20 border border-teal-400/30 flex items-center justify-center">
              <Shield className="w-8 h-8 text-teal-400" strokeWidth={1.5} />
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-bold text-white mb-1">
                {profileLoading ? 'Loading...' : getDisplayName()}
              </h3>
              <p className="text-gray-400 text-sm">Manage your account and saved receipts.</p>
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
              className="ri-surface overflow-hidden"
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

                      {'toggle' in item ? (
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
                      ) : (
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={item.action}
                          className="px-4 py-2 rounded-lg bg-teal-400/20 border border-teal-400/30 text-teal-400 font-semibold text-sm hover:bg-teal-400/30 transition-colors"
                        >
                          {item.actionText}
                        </motion.button>
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
          className="ri-surface mt-6 overflow-hidden"
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
          </div>

          <div className="p-4 border-t border-white/10 space-y-2" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
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
              className="w-full text-left px-4 py-3 min-h-[44px] rounded-lg hover:bg-white/5 transition-colors text-red-400 hover:text-red-300 relative z-50 touch-manipulation"
            >
              Sign Out
            </button>
            <button
              onClick={() => setShowDeleteModal(true)}
              className="w-full text-left px-4 py-3 min-h-[44px] rounded-lg hover:bg-white/5 transition-colors text-red-500 hover:text-red-400 relative z-50 touch-manipulation"
            >
              Delete Account
            </button>
          </div>
        </motion.div>

        {showDeleteModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50"
            onClick={() => !deleteLoading && setShowDeleteModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white/10 border border-white/20 rounded-2xl p-6 max-w-sm w-full backdrop-blur-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-4 mb-4">
                <div className="w-10 h-10 rounded-lg bg-red-500/20 border border-red-500/30 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-6 h-6 text-red-400" strokeWidth={1.5} />
                </div>
                <button
                  onClick={() => setShowDeleteModal(false)}
                  disabled={deleteLoading}
                  className="ml-auto p-1 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
                >
                  <X className="w-5 h-5 text-gray-400" strokeWidth={1.5} />
                </button>
              </div>

              <h2 className="text-xl font-bold text-white mb-2">Delete Account?</h2>
              <p className="text-gray-400 text-sm mb-6">
                This will permanently delete your account and all associated data. This action cannot be undone.
              </p>

              <div className="space-y-3">
                <button
                  onClick={handleDeleteAccount}
                  disabled={deleteLoading}
                  className="w-full px-4 py-3 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 font-semibold hover:bg-red-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {deleteLoading ? 'Deleting...' : 'Delete Account'}
                </button>
                <button
                  onClick={() => setShowDeleteModal(false)}
                  disabled={deleteLoading}
                  className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white font-semibold hover:bg-white/10 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </motion.div>
    </main>
  );
}
