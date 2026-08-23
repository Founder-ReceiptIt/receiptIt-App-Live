import { motion } from 'framer-motion';
import { AlertTriangle, Download, FileText, Mail, MessageCircle, ShieldCheck, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { ReceiptItWordmark } from '../ReceiptItWordmark';

export function SettingsTab() {
  const { user, signOut, deleteAccount } = useAuth();
  const { showToast } = useToast();
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showProtectionDetail, setShowProtectionDetail] = useState(false);

  const handleExport = async () => {
    if (!user) return;
    const { data: receipts, error } = await supabase.from('receipts').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    if (error || !receipts) {
      showToast('Could not prepare your download', 'Please try again in a moment.');
      return;
    }
    const csvCell = (value: unknown) => {
      const rawValue = String(value ?? '');
      const safeValue = /^[=+\-@]/.test(rawValue) ? `'${rawValue}` : rawValue;
      return `"${safeValue.replace(/"/g, '""')}"`;
    };
    const headers = ['Status', 'Document type', 'Date', 'Store', 'Amount', 'Currency', 'Category', 'Reference'];
    const rows = receipts.map((receipt) => [receipt.status, receipt.document_type, receipt.transaction_date, receipt.merchant, receipt.amount, receipt.currency, receipt.category, receipt.reference_number]);
    const blob = new Blob([[headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `receiptIt-data-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDeleteAccount = async () => {
    setDeleteLoading(true);
    const { error } = await deleteAccount();
    setDeleteLoading(false);
    if (error) {
      showToast(error.message || 'Could not delete your account');
      return;
    }
    showToast('Account deleted');
    setShowDeleteModal(false);
  };

  return (
    <div className="mx-auto max-w-7xl px-6 pb-32 pt-8">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
        <h1 className="text-3xl font-bold text-white">Settings</h1>
        <section className="mt-8 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.045]">
          <div className="flex items-center gap-2 border-b border-white/10 px-5 py-4"><Mail className="h-5 w-5 text-teal-300" strokeWidth={1.7} /><h2 className="font-bold text-white">Account</h2></div>
          <div className="p-5"><p className="text-xs font-semibold uppercase tracking-[0.13em] text-gray-500">Email</p><p className="mt-1 break-all text-sm text-gray-300">{user?.email || 'No email set'}</p><button onClick={() => void signOut()} className="mt-5 min-h-11 text-sm font-semibold text-gray-300 transition-colors hover:text-white">Sign out</button></div>
        </section>
        <section className="mt-5 rounded-2xl border border-white/10 bg-white/[0.045] p-6">
          <div className="flex items-start gap-4"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-teal-400/25 bg-teal-400/10"><ShieldCheck className="h-5 w-5 text-teal-300" strokeWidth={1.7} /></div><div><h2 className="text-lg font-bold text-white">Privacy &amp; security</h2><p className="mt-1 text-sm leading-6 text-gray-400">Your receipts and purchase information are private to your account.</p><button type="button" onClick={() => setShowProtectionDetail((value) => !value)} aria-expanded={showProtectionDetail} className="mt-3 inline-flex items-baseline gap-1 text-sm font-semibold text-teal-300 transition-colors hover:text-teal-200">How <ReceiptItWordmark className="text-sm text-teal-300" /> protects your data</button>{showProtectionDetail && <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.16 }} className="mt-3 max-w-xl text-sm leading-6 text-gray-400">Only you can see your saved receipts. You can download or permanently delete your data whenever you need to.</motion.p>}</div></div>
        </section>
        <section className="mt-5 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.045]"><div className="flex items-center gap-2 border-b border-white/10 px-5 py-4"><FileText className="h-5 w-5 text-teal-300" strokeWidth={1.7} /><h2 className="font-bold text-white">Your data</h2></div><div className="divide-y divide-white/10"><div className="flex items-center gap-4 p-5"><Download className="h-5 w-5 shrink-0 text-teal-300" strokeWidth={1.7} /><div className="min-w-0 flex-1"><h3 className="font-semibold text-white">Download my data</h3><p className="mt-1 text-sm text-gray-400">Download a copy of your saved purchase records.</p></div><motion.button whileTap={{ scale: 0.985 }} onClick={() => void handleExport()} className="rounded-lg border border-teal-300/30 bg-teal-400/15 px-3 py-2 text-sm font-semibold text-teal-100 transition-colors hover:bg-teal-400/25">Download</motion.button></div><div className="flex items-center gap-4 p-5"><Trash2 className="h-5 w-5 shrink-0 text-red-300" strokeWidth={1.7} /><div className="min-w-0 flex-1"><h3 className="font-semibold text-white">Delete account</h3><p className="mt-1 text-sm text-gray-400">Permanently remove your account and saved purchase records.</p></div><motion.button whileTap={{ scale: 0.985 }} onClick={() => setShowDeleteModal(true)} className="rounded-lg border border-red-300/25 bg-red-400/10 px-3 py-2 text-sm font-semibold text-red-200 transition-colors hover:bg-red-400/20">Delete</motion.button></div></div></section>
        <section className="mt-5 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.045]"><div className="flex items-center gap-2 border-b border-white/10 px-5 py-4"><MessageCircle className="h-5 w-5 text-teal-300" strokeWidth={1.7} /><h2 className="font-bold text-white">Support &amp; feedback</h2></div><div className="p-5"><p className="text-xs font-semibold uppercase tracking-[0.13em] text-gray-500">Beta version 1.0</p><p className="mt-2 text-sm leading-6 text-gray-400">Send feedback to help improve <ReceiptItWordmark className="text-sm" />.</p><a href="mailto:founder@receiptit.co.uk?subject=receiptIt%20beta%20feedback" className="mt-4 inline-flex min-h-10 items-center rounded-lg border border-teal-300/30 bg-teal-400/15 px-3 py-2 text-sm font-semibold text-teal-100 transition-colors hover:bg-teal-400/25">Send feedback</a></div></section>
        {showDeleteModal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => !deleteLoading && setShowDeleteModal(false)}><motion.div initial={{ opacity: 0, y: 8, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.2 }} className="w-full max-w-sm rounded-2xl border border-white/15 bg-neutral-950 p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="flex items-start gap-3"><div className="rounded-xl border border-red-400/25 bg-red-400/10 p-2"><AlertTriangle className="h-5 w-5 text-red-300" /></div><div className="flex-1"><h2 className="text-lg font-bold text-white">Delete account?</h2><p className="mt-2 text-sm leading-6 text-gray-400">This permanently removes your account and saved purchase records. This cannot be undone.</p></div><button aria-label="Close" onClick={() => setShowDeleteModal(false)} disabled={deleteLoading} className="text-gray-500 transition-colors hover:text-white"><X className="h-5 w-5" /></button></div><div className="mt-6 flex gap-3"><button onClick={() => setShowDeleteModal(false)} disabled={deleteLoading} className="flex-1 rounded-lg border border-white/10 px-3 py-2.5 text-sm font-semibold text-gray-200 hover:bg-white/5">Cancel</button><button onClick={() => void handleDeleteAccount()} disabled={deleteLoading} className="flex-1 rounded-lg border border-red-300/25 bg-red-400/15 px-3 py-2.5 text-sm font-semibold text-red-100 hover:bg-red-400/25 disabled:opacity-50">{deleteLoading ? 'Deleting…' : 'Delete account'}</button></div></motion.div></div>}
      </motion.div>
    </div>
  );
}
