const SHORT_DATE_FORMAT: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
};

const LONG_DATE_FORMAT: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
};

export const PURCHASE_DATE_MISSING_LABEL = 'Purchase date missing';

type ReceiptDateFormat = 'short' | 'long';

const getDateFormatOptions = (format: ReceiptDateFormat): Intl.DateTimeFormatOptions => (
  format === 'long' ? LONG_DATE_FORMAT : SHORT_DATE_FORMAT
);

export const formatReceiptDate = (
  value?: string | null,
  format: ReceiptDateFormat = 'short'
): string | null => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return parsedDate.toLocaleDateString('en-GB', getDateFormatOptions(format));
};

export const getPurchaseDateDisplay = (
  value?: string | null,
  format: ReceiptDateFormat = 'short'
): string => (
  formatReceiptDate(value, format) || PURCHASE_DATE_MISSING_LABEL
);
