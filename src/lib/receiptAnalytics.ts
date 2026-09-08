import { isReceiptAmountKnown } from './receiptAmountState.ts';

export interface AnalyticsReceiptInput {
  amount: unknown;
  status?: string | null;
  errorReason?: string | null;
  documentType?: string | null;
  merchant?: string | null;
  transactionDate?: string | null;
}

const getFiniteAmount = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

export const isAnalyticsPurchaseCandidate = ({
  status,
  documentType,
}: Pick<AnalyticsReceiptInput, 'status' | 'documentType'>): boolean => (
  ['parsed', 'completed', 'needs_review'].includes(status || '')
  && documentType !== 'non_purchase_document'
);

/**
 * One authoritative eligibility boundary for every monetary surface.
 *
 * `parsed`/`completed` means either the processor finished a conventional
 * receipt or the owner explicitly confirmed a purchase document. Review,
 * rejected, failed and duplicate states never contribute until resolved.
 */
export const getAnalyticsEligibleAmount = (receipt: AnalyticsReceiptInput): number | null => {
  if (!['parsed', 'completed'].includes(receipt.status || '')) return null;
  if (receipt.errorReason) return null;
  if (receipt.documentType === 'non_purchase_document') return null;
  if (!isReceiptAmountKnown({
    amount: receipt.amount,
    status: receipt.status,
    merchant: receipt.merchant,
  })) return null;

  const amount = getFiniteAmount(receipt.amount);
  return amount !== null && amount >= 0 && amount <= 1_000_000 ? amount : null;
};

export const getAnalyticsMonthKey = (transactionDate?: string | null): string | null => {
  if (typeof transactionDate !== 'string') return null;
  const value = transactionDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}(?:$|T)/.test(value)) return null;

  const parsed = new Date(value.length === 10 ? `${value}T12:00:00Z` : value);
  if (Number.isNaN(parsed.getTime())) return null;
  return value.slice(0, 7);
};

export const getCurrentCalendarMonthKey = (date = new Date()): string => (
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
);
