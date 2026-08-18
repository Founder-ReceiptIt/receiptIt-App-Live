import { supabase } from './supabase';

export interface ReceiptOriginalSource {
  imageUrl?: string | null;
  storagePath?: string | null;
}

const getNonEmptyString = (value?: string | null): string | null => {
  const normalizedValue = value?.trim();
  return normalizedValue || null;
};

/**
 * Gets the object path without exposing a permanent public URL. This accepts
 * legacy rows where image_url was stored as either the path or a Supabase
 * public URL, so the privacy migration does not strand existing receipts.
 */
export const getReceiptOriginalStoragePath = ({ imageUrl, storagePath }: ReceiptOriginalSource): string | null => {
  const normalizedStoragePath = getNonEmptyString(storagePath);
  if (normalizedStoragePath) return normalizedStoragePath;

  const normalizedImageUrl = getNonEmptyString(imageUrl);
  if (!normalizedImageUrl) return null;
  if (!normalizedImageUrl.startsWith('http')) return normalizedImageUrl;

  try {
    const url = new URL(normalizedImageUrl);
    const storagePrefix = '/storage/v1/object/public/receipts/';
    const storagePathIndex = url.pathname.indexOf(storagePrefix);

    if (storagePathIndex !== -1) {
      return decodeURIComponent(url.pathname.slice(storagePathIndex + storagePrefix.length));
    }
  } catch {
    // A malformed legacy URL is not a path we should send to Storage.
  }

  return null;
};

export const hasReceiptOriginal = (source: ReceiptOriginalSource): boolean =>
  Boolean(getReceiptOriginalStoragePath(source) || getNonEmptyString(source.imageUrl));

const getLegacyExternalUrl = (source: ReceiptOriginalSource): string | null => {
  const normalizedImageUrl = getNonEmptyString(source.imageUrl);
  if (!normalizedImageUrl?.startsWith('http')) return null;

  try {
    const url = new URL(normalizedImageUrl);
    const storagePrefix = '/storage/v1/object/public/receipts/';
    const storagePathIndex = url.pathname.indexOf(storagePrefix);

    // Convert our former public URLs back into a path so they receive a
    // short-lived signed URL too. Only genuinely external legacy links remain
    // external.
    if (storagePathIndex !== -1) return null;
  } catch {
    return null;
  }

  return normalizedImageUrl;
};

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

  return getLegacyExternalUrl(source);
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
