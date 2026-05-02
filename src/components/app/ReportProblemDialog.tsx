import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import {
  BUG_REPORT_ISSUE_TYPES,
  createBugReport,
} from '../../lib/supabase';
import type { BugReportIssueType } from '../../lib/supabase';

const BUG_REPORT_ISSUE_TYPE_LABELS: Record<BugReportIssueType, string> = {
  stuck_processing: 'Receipt is stuck processing',
  currency_missing_loop: 'Currency could not be confirmed',
  receipt_parse_problem: 'Receipt details were read incorrectly',
  other: 'Something else went wrong',
};

interface ReportProblemDialogProps {
  isOpen: boolean;
  onClose: () => void;
  receiptId?: string | null;
  receiptMerchant?: string | null;
  zIndexClassName?: string;
}

export function ReportProblemDialog({
  isOpen,
  onClose,
  receiptId,
  receiptMerchant,
  zIndexClassName = 'z-[70]',
}: ReportProblemDialogProps) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [issueType, setIssueType] = useState<BugReportIssueType>('stuck_processing');
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isIssueTypePickerOpen, setIsIssueTypePickerOpen] = useState(false);

  const selectedIssueTypeLabel = BUG_REPORT_ISSUE_TYPE_LABELS[issueType];

  useEffect(() => {
    if (!isOpen) {
      setIssueType('stuck_processing');
      setNote('');
      setIsSubmitting(false);
      setIsIssueTypePickerOpen(false);
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    if (!receiptId || isSubmitting) return;

    setIsSubmitting(true);

    try {
      const trimmedNote = note.trim() || null;
      const submissionPayload = {
        receiptId,
        userId: user?.id ?? null,
        issueType,
        note: trimmedNote,
      };
      const { error } = await createBugReport(submissionPayload);

      if (error) {
        if (import.meta.env.DEV) {
          console.error('[ReportProblemDialog] Error creating bug report:', {
            receiptId,
            userId: user?.id ?? null,
            issueType,
            note: trimmedNote,
            error,
          });
        }
        showToast('Failed to send report', receiptMerchant || undefined);
        return;
      }

      showToast('Problem reported', 'Thanks for helping us improve receiptIt beta');
      onClose();
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('[ReportProblemDialog] Unexpected error creating bug report:', {
          receiptId,
          userId: user?.id ?? null,
          issueType,
          note: note.trim() || null,
          error,
        });
      }
      showToast('Failed to send report', receiptMerchant || undefined);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={`fixed inset-0 ${zIndexClassName} flex items-center justify-center bg-black/80 backdrop-blur-sm p-4`}
          onClick={() => !isSubmitting && onClose()}
        >
          <motion.div
            initial={{ scale: 0.96, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 12 }}
            className="w-full max-w-md backdrop-blur-xl bg-black/90 border border-white/10 rounded-2xl shadow-[0_0_40px_rgba(0,0,0,0.45)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 p-5 border-b border-white/10">
              <div>
                <h3 className="text-lg font-bold text-white">Report a problem</h3>
                <p className="text-sm text-gray-400">
                  Beta feedback for this receipt.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white hover:border-white/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-white">
                  Issue type
                </label>
                <p className="text-xs text-gray-500">
                  Choose the option that best matches the problem.
                </p>

                <div className="relative">
                  <button
                    type="button"
                    aria-expanded={isIssueTypePickerOpen}
                    aria-haspopup="listbox"
                    onClick={() => !isSubmitting && setIsIssueTypePickerOpen((currentValue) => !currentValue)}
                    disabled={isSubmitting}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-left text-sm font-medium text-white outline-none transition-colors hover:border-white/20 focus:border-teal-400/40 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="min-w-0 flex-1">{selectedIssueTypeLabel}</span>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${
                        isIssueTypePickerOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  <AnimatePresence>
                    {isIssueTypePickerOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.98 }}
                        transition={{ duration: 0.16 }}
                        className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-10 overflow-hidden rounded-2xl border border-white/10 bg-neutral-950/95 shadow-[0_18px_40px_rgba(0,0,0,0.45)] backdrop-blur-xl"
                      >
                        <div
                          role="listbox"
                          aria-label="Issue type"
                          className="max-h-72 overflow-y-auto p-2"
                        >
                          {BUG_REPORT_ISSUE_TYPES.map((issueTypeOption) => {
                            const isSelected = issueTypeOption === issueType;

                            return (
                              <button
                                key={issueTypeOption}
                                type="button"
                                role="option"
                                aria-selected={isSelected}
                                onClick={() => {
                                  setIssueType(issueTypeOption);
                                  setIsIssueTypePickerOpen(false);
                                }}
                                className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-3 text-left text-sm transition-colors ${
                                  isSelected
                                    ? 'bg-teal-500/15 text-teal-200'
                                    : 'text-gray-200 hover:bg-white/5'
                                }`}
                              >
                                <span>{BUG_REPORT_ISSUE_TYPE_LABELS[issueTypeOption]}</span>
                                <Check
                                  className={`h-4 w-4 shrink-0 ${
                                    isSelected ? 'opacity-100' : 'opacity-0'
                                  }`}
                                />
                              </button>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="bug-report-note" className="text-sm font-semibold text-white">
                  Short note
                </label>
                <textarea
                  id="bug-report-note"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Anything helpful we should know?"
                  disabled={isSubmitting}
                  rows={4}
                  maxLength={500}
                  className="w-full resize-none rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-gray-500 outline-none transition-colors hover:border-white/20 focus:border-teal-400/40 disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <p className="text-xs text-gray-500">
                  Optional, up to 500 characters.
                </p>
              </div>
            </div>

            <div className="flex gap-3 p-5 pt-0">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="flex-1 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white font-semibold hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={isSubmitting || !receiptId}
                className="flex-1 px-4 py-2.5 rounded-xl bg-teal-500/20 border border-teal-400/40 text-teal-300 font-semibold hover:bg-teal-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Sending...' : 'Send report'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
