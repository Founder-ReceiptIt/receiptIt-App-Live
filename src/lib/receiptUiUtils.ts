import {
  isFinalizedReceiptStatus,
  isReceiptStaleProcessing,
  needsCurrencyConfirmation,
} from './supabase';
import { getPurchaseDateDisplay } from './receiptDateUtils';

interface ReceiptFailureInput {
  status?: unknown;
  errorReason?: unknown;
  date?: string | null;
  createdAt?: string | null;
  processingAttemptStartedAt?: string | null;
}

export type ReceiptFailureReasonCode =
  | 'currency_missing'
  | 'processing_timeout'
  | 'image_blurry'
  | 'image_too_dark'
  | 'text_too_small'
  | 'cropped_or_incomplete'
  | 'long_receipt'
  | 'unreadable'
  | 'unsupported_file'
  | 'corrupt_pdf'
  | 'encrypted_pdf'
  | 'non_standard_purchase_document'
  | 'non_purchase_document'
  | 'processing_failed';

export type ReceiptFailurePrimaryAction = 'retry' | 'rescan' | 'scan_sections' | 'replace' | 'review';

export interface ReceiptFailureDetails {
  code: ReceiptFailureReasonCode;
  title: string;
  reason: string;
  advice: string | null;
  primaryAction: ReceiptFailurePrimaryAction;
}

const normalizeErrorReason = (errorReason: unknown): string => (
  typeof errorReason === 'string' ? errorReason.trim().toLowerCase() : ''
);

const hasAnyToken = (value: string, tokens: string[]): boolean => (
  tokens.some((token) => value.includes(token))
);

const getExplicitFailureReasonCode = (normalizedErrorReason: string): ReceiptFailureReasonCode | null => {
  if (hasAnyToken(normalizedErrorReason, ['long_receipt', 'long receipt', 'narrow_receipt', 'narrow receipt'])) return 'long_receipt';
  if (hasAnyToken(normalizedErrorReason, ['text_too_small', 'text too small', 'too small to read'])) return 'text_too_small';
  if (hasAnyToken(normalizedErrorReason, ['cropped_or_incomplete', 'cropped', 'out of frame', 'missing content', 'incomplete image'])) return 'cropped_or_incomplete';
  if (hasAnyToken(normalizedErrorReason, ['image_too_dark', 'image too dark', 'too dark', 'dark image'])) return 'image_too_dark';
  if (hasAnyToken(normalizedErrorReason, ['image_blurry', 'blurry', 'blurred', 'out of focus'])) return 'image_blurry';

  if (hasAnyToken(normalizedErrorReason, [
    'hard_to_read', 'hard to read', 'unreadable', 'image_quality', 'image quality',
    'glare', 'low_contrast', 'low contrast', 'poor lighting', 'bad lighting',
  ])) return 'unreadable';

  if (hasAnyToken(normalizedErrorReason, ['encrypted_pdf', 'password-protected', 'password protected', 'encrypted pdf'])) return 'encrypted_pdf';

  if (hasAnyToken(normalizedErrorReason, [
    'corrupt_pdf', 'invalid_pdf', 'malformed_pdf', 'pdf appears incomplete',
    'pdf could not be read safely', 'pdf could not be read or its contents could not be extracted',
  ])) return 'corrupt_pdf';

  if (hasAnyToken(normalizedErrorReason, ['unsupported_file', 'unsupported file', 'does not have a pdf file type'])) return 'unsupported_file';
  if (hasAnyToken(normalizedErrorReason, ['processing_timeout', 'scanner_timeout', 'parse_timeout', 'download_timeout', 'timed out', 'timeout'])) return 'processing_timeout';
  if (hasAnyToken(normalizedErrorReason, ['non_standard_purchase_document', 'non-standard purchase document'])) return 'non_standard_purchase_document';
  if (hasAnyToken(normalizedErrorReason, ['not_purchase_document', 'non_purchase_document', 'not a purchase document'])) return 'non_purchase_document';

  return null;
};

const getFailureCopy = (code: ReceiptFailureReasonCode): ReceiptFailureDetails => {
  switch (code) {
    case 'currency_missing':
      return { code, title: 'Needs review', reason: 'Currency could not be read.', advice: 'Confirm the currency, then we’ll try again.', primaryAction: 'retry' };
    case 'processing_timeout':
      return { code, title: 'Couldn’t finish processing', reason: 'This receipt took too long to process.', advice: 'Try again, or report the problem if it keeps happening.', primaryAction: 'retry' };
    case 'image_blurry':
      return { code, title: 'Too blurry', reason: 'We couldn’t read this clearly.', advice: 'Try again with the receipt in focus.', primaryAction: 'rescan' };
    case 'image_too_dark':
      return { code, title: 'Too dark', reason: 'The receipt is too dark to read.', advice: 'Try again in better light.', primaryAction: 'rescan' };
    case 'text_too_small':
      return { code, title: 'Text too small', reason: 'The text is too small to read.', advice: 'Move closer or photograph the receipt in sections.', primaryAction: 'scan_sections' };
    case 'cropped_or_incomplete':
      return { code, title: 'Receipt incomplete', reason: 'Part of the receipt is missing.', advice: 'Make sure the whole receipt is visible.', primaryAction: 'rescan' };
    case 'long_receipt':
      return { code, title: 'Long receipt', reason: 'This receipt may be easier to read in multiple photos.', advice: 'Scan each section in order, starting at the top.', primaryAction: 'scan_sections' };
    case 'unreadable':
      return { code, title: 'Couldn’t read receipt', reason: 'We couldn’t read enough of this receipt.', advice: 'Try another photo.', primaryAction: 'rescan' };
    case 'unsupported_file':
      return { code, title: 'File not supported', reason: 'This file type isn’t supported.', advice: 'Choose a JPG, PNG or one PDF.', primaryAction: 'replace' };
    case 'corrupt_pdf':
      return { code, title: 'Couldn’t read PDF', reason: 'This PDF appears incomplete or damaged.', advice: 'Export it again, then upload one PDF at a time.', primaryAction: 'replace' };
    case 'encrypted_pdf':
      return { code, title: 'PDF is protected', reason: 'This PDF is password-protected.', advice: 'Remove the password and upload it again.', primaryAction: 'replace' };
    case 'non_standard_purchase_document':
      return { code, title: 'Document review', reason: 'This looks like purchase evidence rather than a standard receipt.', advice: 'Check the details, then keep it if it is useful to you.', primaryAction: 'review' };
    case 'non_purchase_document':
      return { code, title: 'Not a purchase document', reason: 'This doesn’t appear to be a purchase document.', advice: 'Try a receipt, invoice, order confirmation or payment confirmation instead.', primaryAction: 'replace' };
    default:
      return { code: 'processing_failed', title: 'Couldn’t process receipt', reason: 'We couldn’t read enough of this receipt.', advice: 'Try again, or use another photo if the problem continues.', primaryAction: 'retry' };
  }
};

const FALLBACK_FAILURE_STATUSES = new Set(['needs_input', 'failed', 'error']);

export const getReceiptFailureDetails = ({
  status,
  errorReason,
  createdAt,
  processingAttemptStartedAt,
}: ReceiptFailureInput): ReceiptFailureDetails | null => {
  if (needsCurrencyConfirmation(status, errorReason)) return getFailureCopy('currency_missing');
  if (isReceiptStaleProcessing(status, createdAt, processingAttemptStartedAt)) return getFailureCopy('processing_timeout');

  const normalizedErrorReason = normalizeErrorReason(errorReason);
  const explicitCode = getExplicitFailureReasonCode(normalizedErrorReason);
  if (explicitCode) return getFailureCopy(explicitCode);
  if (status === 'rejected') return getFailureCopy('non_purchase_document');
  if (status === 'needs_review') return getFailureCopy('non_standard_purchase_document');

  if ((typeof status === 'string' && FALLBACK_FAILURE_STATUSES.has(status)) || normalizedErrorReason.length > 0) {
    return getFailureCopy('processing_failed');
  }

  return null;
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
  if (!isFinalizedReceiptStatus(status)) return null;
  return getPurchaseDateDisplay(date, format);
};
