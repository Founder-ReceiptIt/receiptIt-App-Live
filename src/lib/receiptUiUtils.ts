import {
  isFinalizedReceiptStatus,
  isReceiptStaleProcessing,
  needsCurrencyConfirmation,
} from './supabase';
import { formatReceiptDate, getPurchaseDateDisplay, PURCHASE_DATE_PENDING_LABEL } from './receiptDateUtils';

export type ReceiptIssueKind =
  | 'stale_processing'
  | 'currency_missing'
  | 'missing_purchase_date'
  | 'non_standard_receipt';

interface ReceiptIssueInput {
  status?: unknown;
  errorReason?: unknown;
  date?: string | null;
  createdAt?: string | null;
  processingAttemptStartedAt?: string | null;
}

const RECEIPT_ISSUE_REASON_BY_KIND: Record<ReceiptIssueKind, string> = {
  stale_processing: 'Image was hard to read',
  currency_missing: 'Currency could not be read',
  missing_purchase_date: 'Purchase date could not be read',
  non_standard_receipt: 'This may not be a standard receipt',
};

const RECEIPT_ISSUE_ADVICE_BY_KIND: Partial<Record<ReceiptIssueKind, string>> = {
  stale_processing: 'Try retaking the photo closer, with the receipt filling the frame.',
};

export const getReceiptIssueKind = ({
  status,
  errorReason,
  date,
  createdAt,
  processingAttemptStartedAt,
}: ReceiptIssueInput): ReceiptIssueKind | null => {
  if (isReceiptStaleProcessing(status, createdAt, processingAttemptStartedAt)) {
    return 'stale_processing';
  }

  if (needsCurrencyConfirmation(status, errorReason)) {
    return 'currency_missing';
  }

  if (isFinalizedReceiptStatus(status) && !formatReceiptDate(date)) {
    return 'missing_purchase_date';
  }

  if (status === 'needs_input') {
    return 'non_standard_receipt';
  }

  return null;
};

export const getReceiptIssueReason = (input: ReceiptIssueInput): string | null => {
  const issueKind = getReceiptIssueKind(input);
  return issueKind ? RECEIPT_ISSUE_REASON_BY_KIND[issueKind] : null;
};

export const getReceiptIssueAdvice = (input: ReceiptIssueInput): string | null => {
  const issueKind = getReceiptIssueKind(input);
  return issueKind ? RECEIPT_ISSUE_ADVICE_BY_KIND[issueKind] ?? null : null;
};

export const getReceiptPurchaseDateDisplay = ({
  status,
  date,
  format = 'short',
}: {
  status?: unknown;
  date?: string | null;
  format?: 'short' | 'long';
}): string | null => {
  if (isFinalizedReceiptStatus(status)) {
    return getPurchaseDateDisplay(date, format);
  }

  if (status === 'processing') {
    return PURCHASE_DATE_PENDING_LABEL;
  }

  return null;
};
