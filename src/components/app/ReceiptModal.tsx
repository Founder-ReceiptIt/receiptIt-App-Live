import { motion, AnimatePresence } from 'framer-motion';
import { X, Shield, Calendar, Clock, Trash2, Tag, MapPin, CreditCard, FileText, Download, MoreVertical, Mail } from 'lucide-react';
import { Receipt } from './WalletTab';
import { useState } from 'react';
import { supabase } from '../../lib/supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

interface ReceiptModalProps {
  receipt: any; // Using 'any' to temporarily bypass strict type checks for the snake/camel case mix
  onClose: () => void;
  onDelete?: () => void;
}

export function ReceiptModal({ receipt, onClose, onDelete }: ReceiptModalProps) {
  const [autoDelete, setAutoDelete] = useState('After Warranty Expires');
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteMenu, setShowDeleteMenu] = useState(false);

  // --- 1. NORMALIZE DATA (The Critical Fix) ---
  // We extract the values regardless of whether they are snake_case or camelCase
  const r_warrantyDate = receipt?.warranty_date || receipt?.warrantyDate;
  const r_emailAlias = receipt?.email_alias || receipt?.emailAlias;
  const r_imageUrl = receipt?.image_url || receipt?.imageUrl;
  const r_merchant = receipt?.merchant || receipt?.store_name || 'Unknown Merchant';
  const r_amount = receipt?.amount || receipt?.total || 0;
  const r_currency = receipt?.currency_symbol || receipt?.currencySymbol || '£';
  const r_cardLast4 = receipt?.card_last_4 || receipt?.cardLast4;
  const r_category = receipt?.category || receipt?.tag || 'Receipt';
  const r_vat = receipt?.vat_amount || receipt?.vat || 0;

  // --- LOGIC: DELETE HANDLING ---
  const handleDelete = async (deleteOption: 'now' | '30days' | 'warranty') => {
    if (!receipt) return;
    if (deleteOption === 'now') {
      if (!confirm(`Delete receipt from ${r_merchant}?`)) return;
      setIsDeleting(true);
      try {
        const { error } = await supabase.from('receipts').delete().eq('id', receipt.id);
        if (error) throw error;
        onDelete?.();
        onClose();
      } catch (error) {
        console.error('Error deleting receipt:', error);
        alert('Failed to delete receipt.');
        setIsDeleting(false);
      }
    } else {
      alert(`This receipt will be deleted: ${deleteOption === '30days' ? 'In 30 Days' : 'When Warranty Expires'}`);
      setShowDeleteMenu(false);
    }
  };

  if (!receipt) return null;

  // --- LOGIC: DATE & WARRANTY ---
  const warrantyEndDate = r_warrantyDate ? new Date(r_warrantyDate) : null;
  const today = new Date();
  const isWarrantyActive = warrantyEndDate && warrantyEndDate > today;
  
  const daysRemaining = warrantyEndDate ? Math.floor((warrantyEndDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : 0;
  const yearsRemaining = Math.floor(daysRemaining / 365);
  const monthsRemaining = Math.floor((daysRemaining % 365) / 30);

  // --- LOGIC: DOWNLOAD URL ---
  const getDownloadUrl = () => {
    if (!r_imageUrl) return null;
    if (r_imageUrl.startsWith('http')) return r_imageUrl;
    return `${SUPABASE_URL}/storage/v1/object/public/receipts/${r_imageUrl}`;
  };

  const downloadUrl = getDownloadUrl();

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
            
            {/* --- HEADER --- */}
            <div className="p-6 border-b border-white/10 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-white">Receipt Details</h2>
              <div className="flex items-center gap-2">
                {downloadUrl && (
                  <motion.a
                    href={downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    className="w-10 h-10 rounded-full backdrop-blur-md bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:text-teal-400 hover:border-teal-400/30 transition-colors"
                    title="Download Original"
                  >
                    <Download className="w-5 h-5" />
                  </motion.a>
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
              
              {/* --- MAIN CARD --- */}
              <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6">
                <div className="flex items-start gap-4 mb-6">
                  <div className="w-16 h-16 flex-shrink-0 rounded-xl bg-gradient-to-br from-white/10 to-white/5 border border-white/10 flex items-center justify-center">
                    <span className="text-2xl font-bold text-teal-400">
                      {r_merchant.charAt(0)}
                    </span>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-2xl font-bold text-white mb-1">{r_merchant}</h3>
                    <p className="text-gray-400 text-sm">
                      {receipt.date ? new Date(receipt.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : 'No Date'}
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
                      {r_currency}{Number(r_amount).toFixed(2)}
                    </div>
                  </div>
                </div>

                {receipt.summary && (
                  <div className="mb-4 p-3 bg-white/5 rounded-lg">
                    <p className="text-teal-400 font-semibold text-sm">{receipt.summary}</p>
                  </div>
                )}

                <div className="flex items-center gap-2 flex-wrap">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold border backdrop-blur-md bg-white/5 border-white/10 text-gray-400">
                    <Tag className="w-4 h-4" />
                    {r_category}
                  </div>
                  {r_cardLast4 && (
                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold border backdrop-blur-md text-gray-400 bg-white/5 border-white/10">
                      <CreditCard className="w-4 h-4" />
                      Card **** {r_cardLast4}
                    </div>
                  )}
                </div>
              </div>

              {/* --- WARRANTY SECTION (FIXED VISIBILITY) --- */}
              {isWarrantyActive && (
                <motion.div
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.1 }}
                  className="relative"
                >
                  <div className="absolute -inset-4 bg-gradient-to-r from-teal-400/20 to-cyan-400/20 blur-3xl" />
                  <div className="relative backdrop-blur-xl bg-gradient-to-br from-teal-400/10 to-cyan-400/10 border-2 border-teal-400/30 rounded-2xl p-6">
                    <div className="flex items-center gap-4">
                      <motion.div
                        animate={{ rotate: [0, 5, -5, 0], scale: [1, 1.05, 1] }}
                        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                        className="relative"
                      >
                         <Shield className="w-12 h-12 text-teal-400 relative z-10" strokeWidth={1.5} />
                      </motion.div>

                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="w-2 h-2 bg-teal-400 rounded-full animate-pulse" />
                          <span className="text-teal-400 font-bold text-xs uppercase tracking-widest">Warranty Active</span>
                        </div>
                        <div className="text-2xl font-bold text-white">
                          Expires in {yearsRemaining > 0 ? `${yearsRemaining} Yr ` : ''}{monthsRemaining} Mo
                        </div>
                        <div className="mt-2 flex items-center gap-4 text-xs text-gray-400">
                           <div className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {warrantyEndDate?.toLocaleDateString()}
                           </div>
                           <div className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {daysRemaining} days left
                           </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* --- BREAKDOWN SECTION --- */}
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6"
              >
                <h4 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-teal-400" />
                  Receipt Breakdown
                </h4>

                {/* ALIAS FIELD (FIXED VISIBILITY) */}
                {r_emailAlias && (
                   <div className="flex justify-between items-center py-3 border-b border-white/10 mb-3">
                     <div className="flex items-center gap-2 text-gray-400 text-sm">
                        <Mail className="w-4 h-4" />
                        Received via
                     </div>
                     <span className="text-teal-400 font-mono text-sm">{r_emailAlias}</span>
                   </div>
                )}

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-gray-400">
                    <span>Subtotal</span>
                    <span>{r_currency}{((Number(r_amount) || 0) - (Number(r_vat) || 0)).toFixed(2)}</span>
                  </div>
                  {Number(r_vat) > 0 && (
                    <div className="flex items-center justify-between text-gray-400">
                      <span>VAT</span>
                      <span>{r_currency}{Number(r_vat).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="h-px bg-white/10 my-3" />
                  <div className="flex items-center justify-between text-white font-bold text-lg">
                    <span>Total</span>
                    <span>{r_currency}{Number(r_amount).toFixed(2)}</span>
                  </div>
                </div>

                <div className="mt-4 p-4 backdrop-blur-md bg-blue-400/10 border border-blue-400/20 rounded-xl">
                  <p className="text-sm text-blue-400">
                    <span className="font-bold">Tax Record:</span> Included in HMRC tax filings.
                  </p>
                </div>
              </motion.div>

              {/* --- ACTION BUTTONS --- */}
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
                  className="w-full flex items-center justify-center gap-3 py-4 rounded-xl font-bold transition-all backdrop-blur-md border bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-white"
                >
                  <MoreVertical className="w-5 h-5" />
                  <span>Manage Receipt</span>
                </motion.button>

                {showDeleteMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="absolute bottom-full left-0 right-0 mb-2 backdrop-blur-xl bg-black/90 border border-white/10 rounded-xl overflow-hidden shadow-lg z-20"
                  >
                    <button
                      onClick={() => handleDelete('now')}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-red-500/10 transition-colors text-left text-red-400 border-b border-white/10"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span className="font-semibold">Delete Now</span>
                    </button>
                    <button onClick={() => handleDelete('warranty')} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 text-gray-400">
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