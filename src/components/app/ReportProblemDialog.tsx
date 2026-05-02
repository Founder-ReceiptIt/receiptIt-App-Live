import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import {
  BUG_REPORT_ISSUE_TYPES,
  createBugReport,
} from '../../lib/supabase';
import type { BugReportIssueType } from '../../lib/supabase';

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

  useEffect(() => {
    if (!isOpen) {
      setIssueType('stuck_processing');
      setNote('');
      setIsSubmitting(false);
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
                <label htmlFor="bug-report-issue-type" className="text-sm font-semibold text-white">
                  Issue type
                </label>
                <select
                  id="bug-report-issue-type"
                  value={issueType}
                  onChange={(event) => setIssueType(event.target.value as BugReportIssueType)}
                  disabled={isSubmitting}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm font-medium text-white outline-none transition-colors hover:border-white/20 focus:border-teal-400/40 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {BUG_REPORT_ISSUE_TYPES.map((issueTypeOption) => (
                    <option key={issueTypeOption} value={issueTypeOption} className="bg-neutral-950 text-white">
                      {issueTypeOption}
                    </option>
                  ))}
                </select>
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
