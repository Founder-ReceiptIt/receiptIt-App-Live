const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export interface ReceiptOriginalSource {
  imageUrl?: string | null;
  storagePath?: string | null;
}

export const getReceiptOriginalUrl = ({ imageUrl, storagePath }: ReceiptOriginalSource): string | null => {
  const normalizedImageUrl = imageUrl?.trim();
  if (normalizedImageUrl) {
    if (normalizedImageUrl.startsWith('http')) return normalizedImageUrl;
    return `${SUPABASE_URL}/storage/v1/object/public/receipts/${normalizedImageUrl}`;
  }

  const normalizedStoragePath = storagePath?.trim();
  if (normalizedStoragePath) {
    return `${SUPABASE_URL}/storage/v1/object/public/receipts/${normalizedStoragePath}`;
  }

  return null;
};

export const openReceiptOriginal = (source: ReceiptOriginalSource): string | null => {
  const originalUrl = getReceiptOriginalUrl(source);
  if (!originalUrl) return null;

  window.open(originalUrl, '_blank', 'noopener,noreferrer');
  return originalUrl;
};
