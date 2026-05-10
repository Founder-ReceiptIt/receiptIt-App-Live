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
  date: _date,
  createdAt,
  processingAttemptStartedAt,
}: ReceiptFailureInput): ReceiptFailureDetails | null => {
  if (needsCurrencyConfirmation(status, errorReason)) {
    return {
      reason: 'Currency could not be read',
      advice: 'Confirm the currency to continue.',
    };
  }

  if (isReceiptStaleProcessing(status, createdAt, processingAttemptStartedAt)) {
    return {
      reason: 'Processing could not complete.',
      advice: null,
    };
  }

  const normalizedErrorReason = normalizeErrorReason(errorReason);

  if (isScannerProcessingError(normalizedErrorReason)) {
    return {
      reason: 'Processing could not complete.',
      advice: null,
    };
  }

  if (isExplicitImageQualityError(normalizedErrorReason)) {
    return {
      reason: 'Image was hard to read',
      advice: 'Retake the photo closer.',
    };
  }

  if (isLongReceiptError(normalizedErrorReason)) {
    return {
      reason: 'Long receipt may be hard to scan',
      advice: 'Try capturing it closer.',
    };
  }

  if (isNonStandardDocumentError(normalizedErrorReason)) {
    return {
      reason: 'This may not be a standard receipt',
      advice: 'You can still keep the original.',
    };
  }

  if (typeof status === 'string' && FALLBACK_FAILURE_STATUSES.has(status)) {
    return {
      reason: 'Processing could not complete.',
      advice: null,
    };
  }

  if (normalizedErrorReason.length > 0) {
    return {
      reason: 'Processing could not complete.',
      advice: null,
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
