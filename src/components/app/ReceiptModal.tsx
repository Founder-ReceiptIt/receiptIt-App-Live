import { motion, AnimatePresence } from 'framer-motion';
import { X, Shield, Calendar, Clock, Trash2, Tag, MapPin, CreditCard, FileText, Download, MoreVertical, Mail, Undo2, Edit2, Save } from 'lucide-react';
import { Receipt } from './WalletTab';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { formatDistance } from 'date-fns';
import { getReturnWindowStatus } from '../../lib/returnWindowUtils';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

interface ReceiptModalProps {
  receipt: Receipt | null;
  onClose: () => void;
  onDelete?: () => void;
}

export function ReceiptModal({ receipt, onClose, onDelete }: ReceiptModalProps) {
  const [autoDelete, setAutoDelete] = useState('After Warranty Expires');
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteMenu, setShowDeleteMenu] = useState(false);
  const [isEditingDates, setIsEditingDates] = useState(false);
  const [editWarrantyDate, setEditWarrantyDate] = useState('');
  const [editReturnDate, setEditReturnDate] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setShowDeleteMenu(false);
    setIsEditingDates(false);
    if (receipt) {
      setEditWarrantyDate(receipt.warrantyDate || '');
      setEditReturnDate(receipt.returnDate || '');
    }
  }, [receipt]);

  // --- LOGIC FIX: ROBUST DELETE HANDLING ---
  const handleDelete = async (deleteOption: 'now' | '30days' | 'warranty') => {
    if (!receipt) return;

    if (deleteOption === 'now') {
      if (!confirm(`Delete receipt from ${receipt.merchant}?`)) return;

      setIsDeleting(true);
      try {
        // Step 1: Try to delete storage file if it exists (don't block if this fails)
        if (receipt.storagePath || receipt.imageUrl) {
          const storagePath = receipt.storagePath || receipt.imageUrl;
          if (storagePath && !storagePath.startsWith('http')) {
            console.log('[Delete] Attempting to delete storage file:', storagePath);
            const { error: storageError } = await supabase
              .storage
              .from('receipts')
              .remove([storagePath]);

            if (storageError) {
              console.warn('[Delete] Storage deletion failed (non-critical):', storageError);
            } else {
              console.log('[Delete] Storage file deleted successfully');
            }
          }
        }

        // Step 2: Delete database record (this must succeed)
        console.log('[Delete] Deleting database record:', receipt.id);
        const { error: dbError } = await supabase
          .from('receipts')
          .delete()
          .eq('id', receipt.id);

        if (dbError) {
          console.error('[Delete] Database deletion failed:', dbError);
          throw dbError;
        }

        console.log('[Delete] Receipt deleted successfully');
        onDelete?.();
        onClose();
      } catch (error) {
        console.error('[Delete] Error deleting receipt:', error);
        alert('Failed to delete receipt. Please try again.');
      } finally {
        setIsDeleting(false);
      }
    } else {
      // Placeholder for future logic
      alert(`This receipt will be deleted: ${deleteOption === '30days' ? 'In 30 Days' : 'When Warranty Expires'}`);
      setShowDeleteMenu(false);
    }
  };

  const handleSaveDates = async () => {
    if (!receipt) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('receipts')
        .update({
          warranty_date: editWarrantyDate || null,
          return_date: editReturnDate || null,
        })
        .eq('id', receipt.id);

      if (error) {
        console.error('[SaveDates] Error updating dates:', error);
        alert('Failed to save dates. Please try again.');
        return;
      }

      console.log('[SaveDates] Dates updated successfully');
      setIsEditingDates(false);

      // Update local receipt object
      if (receipt.warrantyDate !== editWarrantyDate || receipt.returnDate !== editReturnDate) {
        window.location.reload();
      }
    } catch (error) {
      console.error('[SaveDates] Unexpected error:', error);
      alert('Failed to save dates. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!receipt) return null;

  // --- LOGIC FIX: BETTER DATE HANDLING ---
  const warrantyEndDate = receipt.warrantyDate ? new Date(receipt.warrantyDate) : null;
  const today = new Date();
  const isWarrantyActive = warrantyEndDate && warrantyEndDate > today;

  // Calculate specific remaining time for the display
  const daysRemaining = warrantyEndDate ? Math.floor((warrantyEndDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : 0;
  const yearsRemaining = Math.floor(daysRemaining / 365);
  const monthsRemaining = Math.floor((daysRemaining % 365) / 30);

  // Return window status
  const returnWindowStatus = getReturnWindowStatus(receipt.returnDate);

  const getDownloadUrl = () => {
    if (receipt.imageUrl) {
      if (receipt.imageUrl.startsWith('http')) return receipt.imageUrl;
      return `${SUPABASE_URL}/storage/v1/object/public/receipts/${receipt.imageUrl}`;
    }

    if (receipt.storagePath) {
      return `${SUPABASE_URL}/storage/v1/object/public/receipts/${receipt.storagePath}`;
    }

    return null;
  };

  const downloadUrl = getDownloadUrl();

  const handleDownloadClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (downloadUrl) {
      console.log('Opening receipt image:', downloadUrl);
      console.log('Receipt image_url field:', receipt.imageUrl);
      console.log('Is external URL:', receipt.imageUrl?.startsWith('http'));
      window.open(downloadUrl, '_blank', 'noopener,noreferrer');
    } else {
      console.warn('No download URL available for this receipt');
    }
  };

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
                  <motion.button
                    onClick={handleDownloadClick}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    className="w-10 h-10 rounded-full backdrop-blur-md bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:text-teal-400 hover:border-teal-400/30 transition-colors"
                    title="View Original Receipt"
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
              
              {/* --- MAIN CARD --- */}
              <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6">
                <div className="flex items-start gap-4 mb-6">
                  <div className="w-16 h-16 flex-shrink-0 rounded-xl bg-gradient-to-br from-white/10 to-white/5 border border-white/10 flex items-center justify-center">
                    {/* Fallback for icon if missing */}
                    {receipt.merchantIcon ? (
                       <receipt.merchantIcon className="w-8 h-8 text-teal-400" strokeWidth={1.5} />
                    ) : (
                       <span className="text-2xl font-bold text-teal-400">{receipt.merchant.charAt(0)}</span>
                    )}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-2xl font-bold text-white mb-1">{receipt.merchant}</h3>
                    <p className="text-gray-400 text-sm">
                      {new Date(receipt.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
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
                  <div className="mb-4 p-4 bg-gradient-to-r from-teal-400/5 to-cyan-400/5 border border-teal-400/20 rounded-xl">
                    <p className="text-teal-400 font-medium text-sm leading-relaxed">{receipt.summary}</p>
                  </div>
                )}

                <div className="flex items-center gap-2 flex-wrap">
                  <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold border backdrop-blur-md ${receipt.tagColor || 'bg-white/5 border-white/10 text-gray-400'}`}>
                    <Tag className="w-4 h-4" />
                    {receipt.category || 'Receipt'}
                  </div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold border backdrop-blur-md text-gray-400 bg-white/5 border-white/10">
                    <FileText className="w-3.5 h-3.5" />
                    {receipt.referenceNumber}
                  </div>
                  {receipt.cardLast4 && (
                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold border backdrop-blur-md text-gray-400 bg-white/5 border-white/10">
                      <CreditCard className="w-4 h-4" />
                      **** {receipt.cardLast4}
                    </div>
                  )}
                </div>
              </div>

              {/* --- WARRANTY SECTION (Animated & Glowing) --- */}
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
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-2 h-2 bg-teal-400 rounded-full animate-pulse" />
                          <span className="text-teal-400 font-bold text-xs uppercase tracking-widest">Warranty Active</span>
                        </div>
                        <div className="text-3xl font-bold text-white mb-2">
                          {yearsRemaining > 0 && <span>{yearsRemaining} {yearsRemaining === 1 ? 'Year' : 'Years'}{monthsRemaining > 0 ? ', ' : ''}</span>}
                          {monthsRemaining > 0 && <span>{monthsRemaining} {monthsRemaining === 1 ? 'Month' : 'Months'}</span>}
                          {yearsRemaining === 0 && monthsRemaining === 0 && <span>{daysRemaining} {daysRemaining === 1 ? 'Day' : 'Days'}</span>}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-gray-400">
                           <div className="flex items-center gap-1.5">
                              <Calendar className="w-4 h-4" />
                              <span>{warrantyEndDate?.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                           </div>
                           <div className="flex items-center gap-1.5">
                              <Clock className="w-4 h-4" />
                              <span>{daysRemaining} days remaining</span>
                           </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* --- EXPIRED WARRANTY SECTION --- */}
              {!isWarrantyActive && warrantyEndDate && (
                <motion.div
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.1 }}
                  className="backdrop-blur-xl bg-gradient-to-br from-red-400/10 to-red-900/10 border-2 border-red-400/30 rounded-2xl p-6"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 flex-shrink-0 rounded-xl bg-red-400/10 border border-red-400/30 flex items-center justify-center">
                      <Shield className="w-8 h-8 text-red-400" strokeWidth={1.5} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-red-400 font-bold text-xs uppercase tracking-widest">Warranty Expired</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-400">
                        <Calendar className="w-4 h-4" />
                        <span>Expired on {warrantyEndDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* --- RETURN WINDOW SECTION --- */}
              {returnWindowStatus.status === 'active' && (
                <motion.div
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.15 }}
                  className="backdrop-blur-xl bg-gradient-to-br from-red-400/10 to-orange-900/10 border-2 border-red-400/30 rounded-2xl p-6"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 flex-shrink-0 rounded-xl bg-red-400/10 border border-red-400/30 flex items-center justify-center">
                      <Undo2 className="w-7 h-7 text-red-400" strokeWidth={1.5} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-red-400 font-bold text-xs uppercase tracking-widest">Return Window Active</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-400">
                        <Clock className="w-4 h-4" />
                        <span>{returnWindowStatus.daysLeft} days remaining</span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {returnWindowStatus.status === 'urgent' && (
                <motion.div
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.15 }}
                  className="backdrop-blur-xl bg-gradient-to-br from-red-500/20 to-orange-900/20 border-2 border-red-500/50 rounded-2xl p-6 animate-pulse"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 flex-shrink-0 rounded-xl bg-red-500/20 border border-red-500/40 flex items-center justify-center">
                      <Undo2 className="w-7 h-7 text-red-400" strokeWidth={1.5} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-red-400 font-bold text-xs uppercase tracking-widest">⚠️ Return Window Ending Soon</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-red-300">
                        <Clock className="w-4 h-4" />
                        <span className="font-bold">{returnWindowStatus.message}</span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {returnWindowStatus.status === 'expired' && receipt.returnDate && (
                <motion.div
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.15 }}
                  className="backdrop-blur-xl bg-gradient-to-br from-gray-400/10 to-gray-900/10 border-2 border-gray-400/30 rounded-2xl p-6"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 flex-shrink-0 rounded-xl bg-gray-400/10 border border-gray-400/30 flex items-center justify-center">
                      <Undo2 className="w-7 h-7 text-gray-500" strokeWidth={1.5} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-gray-500 font-bold text-xs uppercase tracking-widest">Return Window Expired</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-400">
                        <Calendar className="w-4 h-4" />
                        <span>Expired on {new Date(receipt.returnDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* --- EDIT DATES SECTION --- */}
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6"
              >
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-lg font-bold text-white flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-teal-400" />
                    Important Dates
                  </h4>
                  {!isEditingDates ? (
                    <motion.button
                      onClick={() => setIsEditingDates(true)}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-teal-400/10 border border-teal-400/30 text-teal-400 text-sm font-semibold hover:bg-teal-400/20 transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                      Edit
                    </motion.button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <motion.button
                        onClick={() => {
                          setIsEditingDates(false);
                          setEditWarrantyDate(receipt.warrantyDate || '');
                          setEditReturnDate(receipt.returnDate || '');
                        }}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className="px-3 py-1.5 rounded-lg bg-gray-400/10 border border-gray-400/30 text-gray-400 text-sm font-semibold hover:bg-gray-400/20 transition-colors"
                        disabled={isSaving}
                      >
                        Cancel
                      </motion.button>
                      <motion.button
                        onClick={handleSaveDates}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-teal-400/10 border border-teal-400/30 text-teal-400 text-sm font-semibold hover:bg-teal-400/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={isSaving}
                      >
                        <Save className="w-4 h-4" />
                        {isSaving ? 'Saving...' : 'Save'}
                      </motion.button>
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  {/* Warranty Date */}
                  <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10">
                    <div className="flex items-center gap-3">
                      <Shield className="w-5 h-5 text-emerald-400" />
                      <div>
                        <p className="text-sm font-semibold text-white">Warranty Expiry</p>
                        {!isEditingDates && (
                          <p className="text-xs text-gray-400">
                            {receipt.warrantyDate
                              ? new Date(receipt.warrantyDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                              : 'Not set'}
                          </p>
                        )}
                      </div>
                    </div>
                    {isEditingDates && (
                      <input
                        type="date"
                        value={editWarrantyDate}
                        onChange={(e) => setEditWarrantyDate(e.target.value)}
                        className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-teal-400/50 focus:ring-1 focus:ring-teal-400/50"
                      />
                    )}
                  </div>

                  {/* Return Date */}
                  <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10">
                    <div className="flex items-center gap-3">
                      <Undo2 className="w-5 h-5 text-red-400" />
                      <div>
                        <p className="text-sm font-semibold text-white">Return Window Ends</p>
                        {!isEditingDates && (
                          <p className="text-xs text-gray-400">
                            {receipt.returnDate
                              ? new Date(receipt.returnDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                              : 'Not set'}
                          </p>
                        )}
                      </div>
                    </div>
                    {isEditingDates && (
                      <input
                        type="date"
                        value={editReturnDate}
                        onChange={(e) => setEditReturnDate(e.target.value)}
                        className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-teal-400/50 focus:ring-1 focus:ring-teal-400/50"
                      />
                    )}
                  </div>
                </div>
              </motion.div>

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

                {receipt.emailAlias && (
                   <div className="mb-4 pb-4 border-b border-white/10">
                     <div className="flex items-center justify-between gap-4">
                       <div className="flex items-center gap-2 text-gray-400">
                          <Mail className="w-4 h-4" />
                          <span className="text-sm font-medium">Received via</span>
                       </div>
                       <span className="text-teal-400 font-mono text-sm font-semibold">{receipt.emailAlias}</span>
                     </div>
                   </div>
                )}

                {receipt.items && receipt.items.length > 0 && (
                  <div className="mb-4">
                    <h5 className="text-sm font-bold text-gray-400 mb-3 uppercase tracking-wide">Items Purchased</h5>
                    <div className="space-y-3">
                      {receipt.items.map((item, index) => (
                        <div key={index} className="flex items-start justify-between gap-4 p-3 bg-white/5 rounded-lg">
                          <div className="flex-1">
                            <div className="text-white font-semibold">{item.name}</div>
                            <div className="text-xs text-gray-400 mt-0.5">Quantity: {item.quantity}</div>
                          </div>
                          <div className="text-white font-bold">
                            {receipt.currencySymbol || '£'}{item.price.toFixed(2)}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="h-px bg-white/10 my-4" />
                  </div>
                )}

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-gray-400">
                    <span>Subtotal</span>
                    <span>{receipt.currencySymbol || '£'}{((receipt.amount || 0) - (receipt.vat || 0)).toFixed(2)}</span>
                  </div>
                  {receipt.vat > 0 && (
                    <div className="flex items-center justify-between text-gray-400">
                      <span>VAT ({receipt.vatRate || 20}%)</span>
                      <span>{receipt.currencySymbol || '£'}{receipt.vat.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="h-px bg-white/10 my-3" />
                  <div className="flex items-center justify-between text-white font-bold text-lg">
                    <span>Total</span>
                    <span>{receipt.currencySymbol || '£'}{receipt.amount.toFixed(2)}</span>
                  </div>
                </div>

              </motion.div>

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
                  className="w-full flex items-center justify-center gap-3 py-4 rounded-xl font-bold transition-all backdrop-blur-md border bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-white hover:border-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isDeleting ? (
                    <>
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      >
                        <Clock className="w-5 h-5" />
                      </motion.div>
                      <span>Deleting...</span>
                    </>
                  ) : (
                    <>
                      <MoreVertical className="w-5 h-5" />
                      <span>Manage Receipt</span>
                    </>
                  )}
                </motion.button>

                {showDeleteMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="absolute bottom-full left-0 right-0 mb-2 backdrop-blur-xl bg-black/95 border border-white/10 rounded-xl overflow-hidden shadow-[0_0_30px_rgba(0,0,0,0.5)] z-20"
                  >
                    <button
                      onClick={() => handleDelete('now')}
                      className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-red-500/10 transition-colors text-left text-red-400 hover:text-red-300 border-b border-white/10 group"
                    >
                      <Trash2 className="w-4 h-4 group-hover:scale-110 transition-transform" />
                      <span className="font-semibold">Delete Now</span>
                    </button>
                    <button
                      onClick={() => handleDelete('warranty')}
                      className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-white/5 transition-colors text-gray-400 hover:text-white group"
                    >
                      <Shield className="w-4 h-4 group-hover:scale-110 transition-transform" />
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