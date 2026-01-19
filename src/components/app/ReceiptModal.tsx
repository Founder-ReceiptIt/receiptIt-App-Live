import { motion, AnimatePresence } from 'framer-motion';
import { X, Shield, Calendar, Clock, Trash2, Tag, MapPin, CreditCard, FileText, Mail, MoreVertical, AlertTriangle, Download } from 'lucide-react';
import { Receipt } from './WalletTab';
import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { formatDistanceToNow } from 'date-fns';

interface ReceiptModalProps {
  receipt: Receipt | null;
  onClose: () => void;
  onDelete?: () => void;
}

export function ReceiptModal({ receipt, onClose, onDelete }: ReceiptModalProps) {
  const [autoDelete, setAutoDelete] = useState('After Warranty Expires');
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteMenu, setShowDeleteMenu] = useState(false);

  const handleDelete = async (deleteOption: 'now' | '30days' | 'warranty') => {
    if (!receipt) return;

    if (deleteOption === 'now') {
      if (!confirm(`Delete receipt from ${receipt.merchant}?`)) {
        return;
      }

      setIsDeleting(true);
      try {
        const { error } = await supabase
          .from('receipts')
          .delete()
          .eq('id', receipt.id);

        if (error) throw error;

        onDelete?.();
        onClose();
      } catch (error) {
        console.error('Error deleting receipt:', error);
        alert('Failed to delete receipt. Please try again.');
        setIsDeleting(false);
      }
    } else if (deleteOption === '30days') {
      alert('This receipt will be deleted in 30 days.');
      setShowDeleteMenu(false);
    } else if (deleteOption === 'warranty') {
      alert('This receipt will be deleted when the warranty expires.');
      setShowDeleteMenu(false);
    }
  };

  if (!receipt) return null;

  const warrantyEndDate = receipt.warrantyDate ? new Date(receipt.warrantyDate) : null;
  const today = new Date();
  const daysRemaining = warrantyEndDate ? Math.floor((warrantyEndDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : 0;
  const monthsRemaining = Math.floor(daysRemaining / 30);
  const yearsRemaining = Math.floor(monthsRemaining / 12);
  const remainingMonths = monthsRemaining % 12;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-end md:items-center justify-center"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        />

        <motion.div
          initial={{ y: "100%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "100%", opacity: 0 }}
          transition={{ type: "spring", damping: 30, stiffness: 300 }}
          className="relative w-full max-w-2xl mx-4 mb-4 md:mb-0"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="backdrop-blur-xl bg-black/90 border border-white/10 rounded-3xl overflow-hidden shadow-[0_0_60px_rgba(45,212,191,0.3)]">
            <div className="p-6 border-b border-white/10 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-white">Receipt Details</h2>
              <div className="flex items-center gap-2">
                {(receipt.imageUrl || receipt.storagePath) && (
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => {
                      let url = receipt.imageUrl || receipt.storagePath;
                      if (url) {
                        if (!url.startsWith('http')) {
                          const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
                          url = `${supabaseUrl}/storage/v1/object/public/${url}`;
                        }
                        window.open(url, '_blank', 'noopener,noreferrer');
                      }
                    }}
                    className="w-10 h-10 rounded-full backdrop-blur-md bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:text-teal-400 hover:border-teal-400/30 transition-colors"
                  >
                    <Download className="w-5 h-5" />
                  </motion.button>
                )}
                <motion.button
                  whileHover={{ scale: 1.1, rotate: 90 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={onClose}
                  className="w-10 h-10 rounded-full backdrop-blur-md bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white hover:border-white/20 transition-colors"
                >
                  <X className="w-5 h-5" />
                </motion.button>
              </div>
            </div>

            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
              <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6">
                <div className="flex items-start gap-4 mb-6">
                  <div className="w-16 h-16 flex-shrink-0 rounded-xl bg-gradient-to-br from-white/10 to-white/5 border border-white/10 flex items-center justify-center">
                    <receipt.merchantIcon className="w-8 h-8 text-teal-400" strokeWidth={1.5} />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-2xl font-bold text-white mb-1">{receipt.merchant}</h3>
                    <p className="text-gray-400 text-sm">
                      {new Date(receipt.date).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric'
                      })}
                    </p>
                    {receipt.location && (
                      <div className="flex items-center gap-1.5 mt-2 text-gray-400 text-xs">
                        <MapPin className="w-3 h-3" />
                        <span>{receipt.location}</span>
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-bold text-white">
                      {receipt.currencySymbol || '£'}{receipt.amount.toFixed(2)}
                    </div>
                  </div>
                </div>

                {receipt.summary && (
                  <div className="mb-4 p-3 bg-white/5 rounded-lg">
                    <p className="text-teal-400 font-semibold text-sm">{receipt.summary}</p>
                  </div>
                )}

                <div className="flex items-center gap-2 flex-wrap">
                  <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold border backdrop-blur-md ${receipt.tagColor}`}>
                    <Tag className="w-4 h-4" />
                    {receipt.category || receipt.tag}
                  </div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold border backdrop-blur-md text-gray-400 bg-white/5 border-white/10">
                    <FileText className="w-4 h-4" />
                    {receipt.referenceNumber}
                  </div>
                  {receipt.cardLast4 && (
                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold border backdrop-blur-md text-gray-400 bg-white/5 border-white/10">
                      <CreditCard className="w-4 h-4" />
                      Card **** {receipt.cardLast4}
                    </div>
                  )}
                </div>
              </div>

              {receipt.warrantyDate && daysRemaining > 0 && (
                <motion.div
                  initial={{ scale: 0.98, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.1 }}
                  className="w-full p-4 rounded-xl mb-6 flex items-center gap-4 bg-emerald-900/20 border border-emerald-500/50"
                >
                  <Shield className="text-emerald-400 h-8 w-8 flex-shrink-0" strokeWidth={1.5} />
                  <div className="flex-1">
                    <div className="text-xs tracking-widest text-emerald-400 uppercase font-bold mb-1">
                      WARRANTY ACTIVE
                    </div>
                    <div className="text-lg text-white font-medium">
                      Expires in{' '}
                      {yearsRemaining > 0 && `${yearsRemaining} ${yearsRemaining === 1 ? 'Year' : 'Years'}`}
                      {yearsRemaining > 0 && remainingMonths > 0 && ', '}
                      {remainingMonths > 0 && `${remainingMonths} ${remainingMonths === 1 ? 'Month' : 'Months'}`}
                      {yearsRemaining === 0 && remainingMonths === 0 && `${daysRemaining} ${daysRemaining === 1 ? 'Day' : 'Days'}`}
                    </div>
                  </div>
                </motion.div>
              )}

              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.1 }}
                className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6"
              >
                <h4 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-teal-400" />
                  Receipt Breakdown
                </h4>

                {receipt.emailAlias && (
                  <div className="mb-4 pb-4 border-b border-white/10">
                    <div className="flex items-center justify-between text-gray-400">
                      <span className="flex items-center gap-2">
                        <Mail className="w-4 h-4" />
                        Received via
                      </span>
                      <span className="text-teal-400 font-mono text-sm">{receipt.emailAlias}</span>
                    </div>
                  </div>
                )}

                {receipt.items && receipt.items.length > 0 && (
                  <div className="space-y-3 mb-4 pb-4 border-b border-white/10">
                    {receipt.items.map((item, index) => (
                      <div key={index} className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="text-white font-semibold">{item.name}</div>
                          <div className="text-sm text-gray-400">Qty: {item.quantity}</div>
                        </div>
                        <div className="text-white font-semibold">
                          {receipt.currencySymbol || '£'}{item.price.toFixed(2)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-gray-400">
                    <span>Subtotal</span>
                    <span>{receipt.currencySymbol || '£'}{receipt.subtotal.toFixed(2)}</span>
                  </div>
                  {receipt.vat > 0 && (
                    <div className="flex items-center justify-between text-gray-400">
                      <span>VAT ({receipt.vatRate}%)</span>
                      <span>{receipt.currencySymbol || '£'}{receipt.vat.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="h-px bg-white/10 my-3" />
                  <div className="flex items-center justify-between text-white font-bold text-lg">
                    <span>Total</span>
                    <span>{receipt.currencySymbol || '£'}{receipt.amount.toFixed(2)}</span>
                  </div>
                </div>

                <div className="mt-4 p-4 backdrop-blur-md bg-blue-400/10 border border-blue-400/20 rounded-xl">
                  <p className="text-sm text-blue-400">
                    <span className="font-bold">Tax Record:</span> This receipt includes all information required for HMRC tax filings and expense claims.
                  </p>
                </div>
              </motion.div>

              {receipt.warrantyDate && warrantyEndDate && daysRemaining > 0 && (
                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <Trash2 className="w-5 h-5 text-red-400" />
                      <div>
                        <h4 className="text-lg font-bold text-white">Retention Setting</h4>
                        <p className="text-sm text-gray-400">When should we delete this receipt?</p>
                      </div>
                    </div>
                  </div>

                  <select
                    value={autoDelete}
                    onChange={(e) => setAutoDelete(e.target.value)}
                    className="w-full backdrop-blur-xl bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white font-semibold focus:outline-none focus:border-teal-400/50 transition-colors cursor-pointer hover:bg-white/10"
                  >
                    <option value="After Warranty Expires" className="bg-black">After Warranty Expires</option>
                    <option value="Keep Forever" className="bg-black">Keep Forever</option>
                    <option value="30 Days" className="bg-black">30 Days</option>
                    <option value="90 Days" className="bg-black">90 Days</option>
                    <option value="1 Year" className="bg-black">1 Year</option>
                  </select>

                  <div className="mt-4 p-4 backdrop-blur-md bg-teal-400/10 border border-teal-400/20 rounded-xl">
                    <p className="text-sm text-teal-400">
                      <span className="font-bold">Smart Protection:</span> Emails will be automatically deleted on {warrantyEndDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} to protect your privacy.
                    </p>
                  </div>
                </motion.div>
              )}

              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="relative"
              >
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setShowDeleteMenu(!showDeleteMenu)}
                  disabled={isDeleting}
                  className="w-full flex items-center justify-center gap-3 py-4 rounded-xl font-bold transition-all backdrop-blur-md border bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <MoreVertical className="w-5 h-5" />
                  <span>Manage Receipt</span>
                </motion.button>

                {showDeleteMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="absolute bottom-full left-0 right-0 mb-2 backdrop-blur-xl bg-black/90 border border-white/10 rounded-xl overflow-hidden shadow-lg"
                  >
                    <button
                      onClick={() => handleDelete('now')}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-red-500/10 transition-colors text-left text-red-400 border-b border-white/10"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span className="font-semibold">Delete Now</span>
                    </button>
                    <button
                      onClick={() => handleDelete('30days')}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left text-gray-400 border-b border-white/10"
                    >
                      <Clock className="w-4 h-4" />
                      <span className="font-semibold">Delete in 30 Days</span>
                    </button>
                    <button
                      onClick={() => handleDelete('warranty')}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left text-gray-400"
                    >
                      <Shield className="w-4 h-4" />
                      <span className="font-semibold">Delete when Warranty Expires</span>
                    </button>
                  </motion.div>
                )}
              </motion.div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
