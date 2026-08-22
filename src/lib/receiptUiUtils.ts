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

interface ReceiptFailureDetails {
  title: string;
  reason: string;
  advice: string | null;
}

const normalizeErrorReason = (errorReason: unknown): string => (
  typeof errorReason === 'string' ? errorReason.trim().toLowerCase() : ''
);

const hasAnyToken = (value: string, tokens: string[]): boolean => (
  tokens.some((token) => value.includes(token))
);

const isExplicitImageQualityError = (normalizedErrorReason: string): boolean => (
  hasAnyToken(normalizedErrorReason, [
    'image_quality',
    'image quality',
    'hard_to_read',
    'hard to read',
    'text too small',
    'too small to read',
    'unreadable image',
    'unreadable photo',
    'blurry',
    'blur',
    'glare',
    'low_contrast',
    'low contrast',
    'poor lighting',
    'bad lighting',
    'cropped',
    'out of frame',
  ])
);

const isScannerProcessingError = (normalizedErrorReason: string): boolean => (
  hasAnyToken(normalizedErrorReason, [
    'timeout',
    'timed out',
    'download_timeout',
    'processing_timeout',
    'scanner_timeout',
    'parse_timeout',
    'failed_to_process',
    'processing_failed',
    'scanner_failed',
    'ocr_failed',
    'parse_failed',
    'json_parse_failed',
  ])
);

const isLongReceiptError = (normalizedErrorReason: string): boolean => (
  hasAnyToken(normalizedErrorReason, [
    'long_receipt',
    'long receipt',
    'narrow_receipt',
    'narrow receipt',
  ])
);

const isNonStandardDocumentError = (normalizedErrorReason: string): boolean => (
  hasAnyToken(normalizedErrorReason, [
    'non_standard',
    'non-standard',
    'ticket',
    'payment slip',
    'invoice',
    'confirmation',
  ])
);

const FALLBACK_FAILURE_STATUSES = new Set(['needs_input', 'failed']);

export const getReceiptFailureDetails = ({
  status,
  errorReason,
  createdAt,
  processingAttemptStartedAt,
}: ReceiptFailureInput): ReceiptFailureDetails | null => {
  if (needsCurrencyConfirmation(status, errorReason)) {
    return {
      title: 'Needs review',
      reason: 'Currency could not be read',
      advice: 'Confirm the currency, then we’ll retry it.',
    };
  }

  if (isReceiptStaleProcessing(status, createdAt, processingAttemptStartedAt)) {
    return {
      title: 'Couldn’t finish processing',
      reason: 'This receipt took too long to process.',
      advice: 'Retry it, or report the problem if it keeps happening.',
    };
  }

  const normalizedErrorReason = normalizeErrorReason(errorReason);

  if (isScannerProcessingError(normalizedErrorReason)) {
    return {
      title: 'Couldn’t process this receipt',
      reason: 'We couldn’t finish reading this file.',
      advice: 'Retry it, or report the problem if it keeps happening.',
    };
  }

  if (isExplicitImageQualityError(normalizedErrorReason)) {
    return {
      title: 'Needs a clearer image',
      reason: 'Image was hard to read',
      advice: 'Retake it closer, flatter and in better light.',
    };
  }

  if (isLongReceiptError(normalizedErrorReason)) {
    return {
      title: 'Needs a clearer scan',
      reason: 'Long receipt may be hard to scan',
      advice: 'Capture it closer or upload it in sections.',
    };
  }

  if (isNonStandardDocumentError(normalizedErrorReason)) {
    return {
      title: 'Document review',
      reason: 'This may not be a standard receipt',
      advice: 'Keep the receipt if it is useful to you.',
    };
  }

  if (status === 'rejected') {
    return {
      title: 'Not a purchase document',
      reason: 'This file does not appear to be a receipt or purchase document.',
      advice: 'Try a receipt, invoice, order confirmation or payment confirmation instead.',
    };
  }

  if (status === 'needs_review') {
    return {
      title: 'Document review',
      reason: normalizedErrorReason === 'non_standard_purchase_document'
        ? 'This looks like a purchase document rather than a standard receipt.'
        : 'This may be useful, but it is not a standard receipt.',
      advice: 'Review the receipt and keep it if it is useful to you.',
    };
  }

  if (typeof status === 'string' && FALLBACK_FAILURE_STATUSES.has(status)) {
    return {
      title: 'Couldn’t process this receipt',
      reason: 'We couldn’t process this file.',
      advice: 'Retry it or upload a clearer copy.',
    };
  }

  if (normalizedErrorReason.length > 0) {
    return {
      title: 'Couldn’t process this receipt',
      reason: 'We couldn’t process this file.',
      advice: 'Retry it or upload a clearer copy.',
    };
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
  if (!isFinalizedReceiptStatus(status)) {
    return null;
  }

  return getPurchaseDateDisplay(date, format);
};
