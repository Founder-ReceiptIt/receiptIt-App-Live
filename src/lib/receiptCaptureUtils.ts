const SCAN_SECTIONS_INTENT_KEY = 'receiptit:scan-sections-intent';

export const requestReceiptSectionCapture = (): void => {
  window.sessionStorage.setItem(SCAN_SECTIONS_INTENT_KEY, 'true');
};

export const consumeReceiptSectionCaptureRequest = (): boolean => {
  const requested = window.sessionStorage.getItem(SCAN_SECTIONS_INTENT_KEY) === 'true';
  window.sessionStorage.removeItem(SCAN_SECTIONS_INTENT_KEY);
  return requested;
};
