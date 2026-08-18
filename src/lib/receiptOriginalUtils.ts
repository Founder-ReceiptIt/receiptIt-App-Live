import { supabase } from './supabase';
import {
  getExternalLegacyReceiptUrl,
  getReceiptOriginalStoragePath,
  hasReceiptOriginalPath,
  type ReceiptOriginalPathSource,
} from './receiptOriginalPathUtils';

export type ReceiptOriginalSource = ReceiptOriginalPathSource;

export { getReceiptOriginalStoragePath } from './receiptOriginalPathUtils';

export const hasReceiptOriginal = (source: ReceiptOriginalSource): boolean =>
  hasReceiptOriginalPath(source) || Boolean(getExternalLegacyReceiptUrl(source));

export const resolveReceiptOriginalUrl = async (source: ReceiptOriginalSource): Promise<string | null> => {
  const storagePath = getReceiptOriginalStoragePath(source);

  if (storagePath) {
    const { data, error } = await supabase.storage
      .from('receipts')
      .createSignedUrl(storagePath, 60);

    if (!error && data?.signedUrl) return data.signedUrl;
    console.warn('[ReceiptOriginal] Could not create a signed receipt URL:', error?.message);
    return null;
  }

  return getExternalLegacyReceiptUrl(source);
};

export const openReceiptOriginal = async (source: ReceiptOriginalSource): Promise<string | null> => {
  // Open synchronously from the click handler so mobile and desktop browsers
  // do not block the signed receipt as a popup. It is pointed at the signed
  // destination only after the URL is resolved.
  const receiptWindow = window.open('', '_blank');
  const originalUrl = await resolveReceiptOriginalUrl(source);

  if (!originalUrl) {
    receiptWindow?.close();
    return null;
  }

  if (receiptWindow) {
    receiptWindow.opener = null;
    receiptWindow.location.href = originalUrl;
  } else {
    window.open(originalUrl, '_blank', 'noopener,noreferrer');
  }

  return originalUrl;
};
