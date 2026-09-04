import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  CopyCheck,
  FileCheck2,
  Inbox,
  Mail,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';

type ActivityTone = 'success' | 'processing' | 'attention' | 'neutral';

interface ActivityEvent {
  id: string;
  occurredAt: string;
  title: string;
  detail: string;
  tone: ActivityTone;
  icon: LucideIcon;
  receiptId?: string;
  actionLabel?: string;
  needsAttention: boolean;
}

interface ReceiptActivityRow {
  id: string;
  merchant: string | null;
  source: string | null;
  status: string | null;
  error_reason: string | null;
  document_type: string | null;
  created_at: string;
  parsed_at: string | null;
}

interface InboundMessageRow {
  id: string;
  sender_domain: string | null;
  classification: string;
  status: string;
  error_reason: string | null;
  received_at: string;
  processed_at: string | null;
}

interface InboundAttachmentRow {
  inbound_message_id: string;
  receipt_id: string | null;
  status: string;
}

interface PurchaseActivityRow {
  id: string;
  receipt_id: string;
  event_type: string;
  created_at: string;
}

interface PossibleDuplicateRow {
  receipt_id: string;
  possible_duplicate_of: string;
  created_at: string;
  decision: string;
}

interface ActivityTabProps {
  onOpenReceipt: (receiptId: string) => void;
}

const formatRelativeTime = (value: string): string => {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return '';

  const elapsedMinutes = Math.max(0, Math.round((Date.now() - timestamp) / 60_000));
  if (elapsedMinutes < 1) return 'Just now';
  if (elapsedMinutes < 60) return `${elapsedMinutes} min ago`;
  const elapsedHours = Math.round(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours} hr ago`;
  const elapsedDays = Math.round(elapsedHours / 24);
  if (elapsedDays === 1) return 'Yesterday';
  if (elapsedDays < 7) return `${elapsedDays} days ago`;
  return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

const merchantLabel = (receipt?: ReceiptActivityRow): string => {
  const merchant = receipt?.merchant?.trim();
  return merchant && !/^analy[sz]ing\.\.\.$/i.test(merchant) ? merchant : 'Your purchase';
};

const activityStyle: Record<ActivityTone, { shell: string; icon: string }> = {
  success: { shell: 'border-teal-300/20 bg-teal-400/[0.07]', icon: 'border-teal-300/25 bg-teal-400/10 text-teal-200' },
  processing: { shell: 'border-white/10 bg-white/[0.045]', icon: 'border-white/10 bg-white/5 text-gray-300' },
  attention: { shell: 'border-amber-300/20 bg-amber-400/[0.07]', icon: 'border-amber-300/25 bg-amber-400/10 text-amber-200' },
  neutral: { shell: 'border-white/10 bg-white/[0.035]', icon: 'border-white/10 bg-white/5 text-gray-400' },
};

export function ActivityTab({ onOpenReceipt }: ActivityTabProps) {
  const { user } = useAuth();
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const loadActivity = useCallback(async () => {
    if (!user) return;

    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const [receiptResult, messageResult, attachmentResult, actionResult, duplicateResult] = await Promise.all([
      supabase
        .from('receipts')
        .select('id,merchant,source,status,error_reason,document_type,created_at,parsed_at')
        .eq('user_id', user.id)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('inbound_messages')
        .select('id,sender_domain,classification,status,error_reason,received_at,processed_at')
        .eq('user_id', user.id)
        .gte('received_at', since)
        .order('received_at', { ascending: false })
        .limit(100),
      supabase
        .from('inbound_attachments')
        .select('inbound_message_id,receipt_id,status')
        .eq('user_id', user.id)
        .gte('created_at', since)
        .limit(150),
      supabase
        .from('purchase_activity')
        .select('id,receipt_id,event_type,created_at')
        .eq('user_id', user.id)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('receipt_possible_duplicates')
        .select('receipt_id,possible_duplicate_of,created_at,decision')
        .eq('user_id', user.id)
        .eq('decision', 'pending')
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

    const firstError = [receiptResult, messageResult, attachmentResult, actionResult, duplicateResult]
      .find((result) => result.error)?.error;
    if (firstError) {
      console.error('[ActivityTab] Could not load activity:', firstError);
      setLoadError(true);
      setLoading(false);
      return;
    }

    const receipts = (receiptResult.data || []) as ReceiptActivityRow[];
    const messages = (messageResult.data || []) as InboundMessageRow[];
    const attachments = (attachmentResult.data || []) as InboundAttachmentRow[];
    const actions = (actionResult.data || []) as PurchaseActivityRow[];
    const duplicateCandidates = (duplicateResult.data || []) as PossibleDuplicateRow[];
    const receiptsById = new Map(receipts.map((receipt) => [receipt.id, receipt]));
    const receiptIdsHandledByEmail = new Set(
      attachments.map((attachment) => attachment.receipt_id).filter((receiptId): receiptId is string => Boolean(receiptId)),
    );
    const attachmentsByMessage = new Map<string, InboundAttachmentRow[]>();
    attachments.forEach((attachment) => {
      attachmentsByMessage.set(
        attachment.inbound_message_id,
        [...(attachmentsByMessage.get(attachment.inbound_message_id) || []), attachment],
      );
    });

    const nextEvents: ActivityEvent[] = [];

    duplicateCandidates.forEach((candidate) => {
      const receipt = receiptsById.get(candidate.receipt_id);
      const existing = receiptsById.get(candidate.possible_duplicate_of);
      nextEvents.push({
        id: `possible-duplicate:${candidate.receipt_id}`,
        occurredAt: candidate.created_at,
        title: 'Possible duplicate',
        detail: `${merchantLabel(receipt)} looks similar to ${merchantLabel(existing)} already saved.`,
        tone: 'attention',
        icon: CopyCheck,
        receiptId: candidate.receipt_id,
        actionLabel: 'Review in Wallet',
        needsAttention: true,
      });
    });

    messages.forEach((message) => {
      if (message.classification === 'marketing' && message.status === 'ignored') return;

      const messageAttachments = attachmentsByMessage.get(message.id) || [];
      const receiptId = messageAttachments.find((attachment) => attachment.receipt_id)?.receipt_id || undefined;
      const receipt = receiptId ? receiptsById.get(receiptId) : undefined;
      const senderDetail = message.sender_domain ? `From ${message.sender_domain}` : 'Received through your receiptIt address';
      const occurredAt = message.processed_at || message.received_at;

      if (message.status === 'duplicate') {
        nextEvents.push({ id: `email:${message.id}`, occurredAt, title: 'Duplicate already saved', detail: senderDetail, tone: 'neutral', icon: CopyCheck, receiptId, needsAttention: false });
      } else if (message.status === 'failed' || message.status === 'rejected') {
        nextEvents.push({ id: `email:${message.id}`, occurredAt, title: 'Couldn’t process purchase email', detail: `${senderDetail}. Try forwarding it again or add the receipt directly.`, tone: 'attention', icon: AlertTriangle, receiptId, actionLabel: receiptId ? 'View in Wallet' : undefined, needsAttention: true });
      } else if (receipt?.status === 'needs_review') {
        nextEvents.push({ id: `email:${message.id}`, occurredAt, title: 'Email needs review', detail: `${merchantLabel(receipt)} was recognised as purchase evidence.`, tone: 'attention', icon: Mail, receiptId, actionLabel: 'Review details', needsAttention: true });
      } else if (receipt?.status === 'processing') {
        nextEvents.push({ id: `email:${message.id}`, occurredAt: message.received_at, title: 'Receipt processing', detail: senderDetail, tone: 'processing', icon: Clock3, receiptId, needsAttention: false });
      } else if (receipt && ['parsed', 'completed'].includes(receipt.status || '')) {
        nextEvents.push({ id: `email:${message.id}`, occurredAt, title: 'Email received and added', detail: merchantLabel(receipt), tone: 'success', icon: Mail, receiptId, actionLabel: 'View purchase', needsAttention: false });
      } else if (message.status === 'received' || message.status === 'processing' || message.status === 'processed') {
        nextEvents.push({ id: `email:${message.id}`, occurredAt: message.received_at, title: 'Email received', detail: senderDetail, tone: 'processing', icon: Mail, receiptId, needsAttention: false });
      }
    });

    receipts.forEach((receipt) => {
      if (receiptIdsHandledByEmail.has(receipt.id) || receipt.status === 'duplicate' || receipt.status === 'skipped') return;
      const occurredAt = receipt.parsed_at || receipt.created_at;
      if (receipt.status === 'processing') {
        nextEvents.push({ id: `receipt:${receipt.id}`, occurredAt, title: 'Receipt processing', detail: 'You can leave receiptIt while this finishes.', tone: 'processing', icon: Clock3, receiptId: receipt.id, needsAttention: false });
      } else if (['parsed', 'completed'].includes(receipt.status || '')) {
        nextEvents.push({ id: `receipt:${receipt.id}`, occurredAt, title: 'Receipt added', detail: merchantLabel(receipt), tone: 'success', icon: CheckCircle2, receiptId: receipt.id, actionLabel: 'View purchase', needsAttention: false });
      } else if (receipt.status === 'needs_review' || receipt.status === 'needs_input') {
        nextEvents.push({ id: `receipt:${receipt.id}`, occurredAt, title: receipt.status === 'needs_review' ? 'Purchase needs review' : 'Receipt needs a detail', detail: merchantLabel(receipt), tone: 'attention', icon: AlertTriangle, receiptId: receipt.id, actionLabel: 'Review details', needsAttention: true });
      } else if (receipt.status === 'failed' || receipt.status === 'error') {
        nextEvents.push({ id: `receipt:${receipt.id}`, occurredAt, title: 'Couldn’t process receipt', detail: 'The original is still safe. Try again from your Wallet.', tone: 'attention', icon: AlertTriangle, receiptId: receipt.id, actionLabel: 'View in Wallet', needsAttention: true });
      } else if (receipt.status === 'rejected') {
        nextEvents.push({ id: `receipt:${receipt.id}`, occurredAt, title: 'File not added as a purchase', detail: 'It did not look like a receipt or purchase document.', tone: 'neutral', icon: FileCheck2, receiptId: receipt.id, actionLabel: 'View in Wallet', needsAttention: false });
      }
    });

    actions.forEach((action) => {
      const receipt = receiptsById.get(action.receipt_id);
      if (action.event_type === 'exact_duplicate_detected') {
        nextEvents.push({ id: `action:${action.id}`, occurredAt: action.created_at, title: 'Duplicate already saved', detail: merchantLabel(receipt), tone: 'neutral', icon: CopyCheck, receiptId: action.receipt_id, actionLabel: 'View existing', needsAttention: false });
      } else if (action.event_type === 'proof_pack_generated') {
        nextEvents.push({ id: `action:${action.id}`, occurredAt: action.created_at, title: 'Proof of purchase created', detail: merchantLabel(receipt), tone: 'success', icon: FileCheck2, receiptId: action.receipt_id, actionLabel: 'View purchase', needsAttention: false });
      }
    });

    setEvents(nextEvents.sort((first, second) => (
      new Date(second.occurredAt).getTime() - new Date(first.occurredAt).getTime()
    )).slice(0, 100));
    setLoadError(false);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void loadActivity();
    const refreshOnFocus = () => { if (document.visibilityState === 'visible') void loadActivity(); };
    document.addEventListener('visibilitychange', refreshOnFocus);
    const refreshTimer = window.setInterval(() => void loadActivity(), 30_000);
    return () => {
      document.removeEventListener('visibilitychange', refreshOnFocus);
      window.clearInterval(refreshTimer);
    };
  }, [loadActivity]);

  const attentionEvents = useMemo(() => events.filter((event) => event.needsAttention), [events]);
  const recentEvents = useMemo(() => events.filter((event) => !event.needsAttention), [events]);

  const renderEvent = (event: ActivityEvent, index: number) => {
    const Icon = event.icon;
    const style = activityStyle[event.tone];
    return (
      <motion.article
        key={event.id}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18, delay: Math.min(index * 0.025, 0.15) }}
        className={`min-w-0 rounded-2xl border p-4 sm:p-5 ${style.shell}`}
      >
        <div className="flex min-w-0 items-start gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${style.icon}`}>
            <Icon className="h-5 w-5" strokeWidth={1.7} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1">
              <h3 className="break-words font-bold text-white">{event.title}</h3>
              <time className="shrink-0 text-xs text-gray-500" dateTime={event.occurredAt}>{formatRelativeTime(event.occurredAt)}</time>
            </div>
            <p className="mt-1 break-words text-sm leading-6 text-gray-400">{event.detail}</p>
            {event.receiptId && event.actionLabel ? (
              <button
                type="button"
                onClick={() => onOpenReceipt(event.receiptId!)}
                className="mt-3 min-h-10 rounded-lg border border-white/10 px-3 py-2 text-sm font-semibold text-teal-200 transition-colors hover:border-teal-300/30 hover:bg-teal-400/10"
              >
                {event.actionLabel}
              </button>
            ) : null}
          </div>
        </div>
      </motion.article>
    );
  };

  return (
    <div className="ri-mobile-page mx-auto min-w-0 max-w-4xl px-4 pt-8 sm:px-6">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">Activity</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-gray-400">What receiptIt has done with your purchases.</p>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-10 text-center">
            <Clock3 className="mx-auto h-8 w-8 animate-pulse text-teal-300" />
            <p className="mt-3 text-sm text-gray-400">Loading activity…</p>
          </div>
        ) : loadError ? (
          <div className="rounded-2xl border border-amber-300/20 bg-amber-400/[0.07] p-5">
            <h2 className="font-bold text-white">Activity is unavailable</h2>
            <p className="mt-1 text-sm text-gray-400">Your receipts are unaffected. Try again in a moment.</p>
            <button type="button" onClick={() => void loadActivity()} className="mt-4 rounded-lg border border-white/10 px-3 py-2 text-sm font-semibold text-teal-200">Try again</button>
          </div>
        ) : events.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-10 text-center">
            <Inbox className="mx-auto h-10 w-10 text-gray-500" strokeWidth={1.5} />
            <h2 className="mt-4 text-lg font-bold text-white">Nothing to review</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-gray-400">New receipt activity will appear here.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {attentionEvents.length > 0 ? (
              <section>
                <h2 className="mb-3 text-sm font-bold uppercase tracking-[0.14em] text-amber-200">Needs your attention</h2>
                <div className="space-y-3">{attentionEvents.map(renderEvent)}</div>
              </section>
            ) : (
              <div className="rounded-2xl border border-teal-300/15 bg-teal-400/[0.05] p-4">
                <div className="flex items-center gap-3"><CheckCircle2 className="h-5 w-5 text-teal-300" /><p className="text-sm font-semibold text-teal-100">Nothing needs your attention.</p></div>
              </div>
            )}
            {recentEvents.length > 0 ? (
              <section>
                <h2 className="mb-3 text-sm font-bold uppercase tracking-[0.14em] text-gray-400">Recent</h2>
                <div className="space-y-3">{recentEvents.map(renderEvent)}</div>
              </section>
            ) : null}
          </div>
        )}
        <p className="mt-8 text-center text-xs leading-5 text-gray-600">Shows meaningful activity from the last 90 days. Email contents are not shown.</p>
      </motion.div>
    </div>
  );
}
