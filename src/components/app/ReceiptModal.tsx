import { motion, AnimatePresence } from 'framer-motion';
import { X, Shield, Calendar, Clock, Trash2, Tag, MapPin, CreditCard, FileText, Mail } from 'lucide-react';
import { Receipt } from './WalletTab';
import { useState } from 'react';
import { db, deleteDoc, doc } from '../../lib/firebase';

interface ReceiptModalProps {
  receipt: Receipt | null;
  onClose: () => void;
}

export function ReceiptModal({ receipt, onClose }: ReceiptModalProps) {
  const [autoDelete, setAutoDelete] = useState('After Warranty Expires');
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (!receipt) return;

    if (receipt.id === 'fake-apple-demo') {
      alert('This is a demo receipt and cannot be deleted.');
      return;
    }

    if (!confirm(`Delete receipt from ${receipt.merchant}?`)) {
      return;
    }

    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'receipts', receipt.id));
      onClose();
    } catch (error) {
      console.error('Error deleting receipt:', error);
      alert('Failed to delete receipt. Please try again.');
      setIsDeleting(false);
    }
  };

  if (!receipt) return null;

  const warrantyEndDate = new Date('2027-12-15');
  const today = new Date();
  const daysRemaining = Math.floor((warrantyEndDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
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
              <motion.button
                whileHover={{ scale: 1.1, rotate: 90 }}
                whileTap={{ scale: 0.9 }}
                onClick={onClose}
                className="w-10 h-10 rounded-full backdrop-blur-md bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white hover:border-white/20 transition-colors"
              >
                <X className="w-5 h-5" />
              </motion.button>
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

                <div className="flex items-center gap-2 flex-wrap">
                  <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold border backdrop-blur-md ${receipt.tagColor}`}>
                    <Tag className="w-4 h-4" />
                    {receipt.tag}
                  </div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold border backdrop-blur-md text-gray-400 bg-white/5 border-white/10">
                    <FileText className="w-4 h-4" />
                    {receipt.referenceNumber}
                  </div>
                  {receipt.paymentMethod && (
                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold border backdrop-blur-md text-gray-400 bg-white/5 border-white/10">
                      <CreditCard className="w-4 h-4" />
                      {receipt.paymentMethod}
                    </div>
                  )}
                </div>
              </div>

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
                  <div className="flex items-center justify-between text-gray-400">
                    <span>VAT ({receipt.vatRate}%)</span>
                    <span>{receipt.currencySymbol || '£'}{receipt.vat.toFixed(2)}</span>
                  </div>
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

                {receipt.warrantyDate && (
                  <div className="mt-4 p-4 backdrop-blur-md bg-teal-400/10 border border-teal-400/20 rounded-xl">
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-teal-400" />
                      <span className="text-sm font-bold text-teal-400">Warranty Expiry:</span>
                      <span className="text-sm text-white">
                        {new Date(receipt.warrantyDate).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric'
                        })}
                      </span>
                    </div>
                  </div>
                )}
              </motion.div>

              {receipt.hasWarranty && (
                <>
                  <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.1 }}
                    className="relative"
                  >
                    <div className="absolute -inset-4 bg-gradient-to-r from-teal-400/20 to-cyan-400/20 blur-3xl" />

                    <div className="relative backdrop-blur-xl bg-gradient-to-br from-teal-400/10 to-cyan-400/10 border-2 border-teal-400/30 rounded-2xl p-8">
                      <div className="flex items-start gap-4">
                        <motion.div
                          animate={{
                            rotate: [0, 5, -5, 0],
                            scale: [1, 1.05, 1],
                          }}
                          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                          className="relative"
                        >
                          <motion.div
                            animate={{
                              scale: [1, 1.3, 1],
                              opacity: [0.3, 0.6, 0.3]
                            }}
                            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                            className="absolute inset-0 blur-xl bg-teal-400/50 rounded-full"
                          />
                          <Shield className="w-16 h-16 text-teal-400 relative z-10" strokeWidth={1.5} />
                        </motion.div>

                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-3 h-3 bg-teal-400 rounded-full animate-pulse" />
                            <span className="text-teal-400 font-bold text-lg">Warranty Active</span>
                          </div>
                          <div className="text-4xl font-bold text-white mb-2">
                            {yearsRemaining} {yearsRemaining === 1 ? 'Year' : 'Years'}, {remainingMonths} {remainingMonths === 1 ? 'Month' : 'Months'}
                          </div>
                          <p className="text-gray-400">Remaining on manufacturer warranty</p>

                          <div className="mt-4 flex items-center gap-4 text-sm">
                            <div className="flex items-center gap-2 text-gray-400">
                              <Calendar className="w-4 h-4" />
                              <span>Expires: {warrantyEndDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                            </div>
                            <div className="flex items-center gap-2 text-gray-400">
                              <Clock className="w-4 h-4" />
                              <span>{daysRemaining} days left</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>

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
                </>
              )}

              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: receipt.hasWarranty ? 0.4 : 0.2 }}
                className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6"
              >
                <h4 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                  <Mail className="w-5 h-5 text-teal-400" />
                  Email Alias Used
                </h4>
                <div className="backdrop-blur-md bg-white/5 border border-white/10 rounded-xl px-4 py-3">
                  <span className="text-teal-400 font-mono text-lg">{receipt.emailAlias}</span>
                </div>
                <p className="text-sm text-gray-400 mt-3">
                  This privacy-protected email was used for this transaction
                </p>
              </motion.div>

              {receipt.id !== 'fake-apple-demo' && (
                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: receipt.hasWarranty ? 0.5 : 0.3 }}
                >
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="w-full flex items-center justify-center gap-3 py-4 rounded-xl font-bold transition-all backdrop-blur-md border bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Trash2 className="w-5 h-5" />
                    <span>{isDeleting ? 'Deleting...' : 'Delete Receipt'}</span>
                  </motion.button>
                </motion.div>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
