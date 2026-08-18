export interface ReceiptOriginalPathSource {
  imageUrl?: string | null;
  storagePath?: string | null;
}

const getNonEmptyString = (value?: string | null): string | null => {
  const normalizedValue = value?.trim();
  return normalizedValue || null;
};

/**
 * Resolves the private Storage object path for both current records and
 * historic records which stored a public Supabase object URL. The path, not
 * the URL, is the durable receipt-original reference.
 */
export const getReceiptOriginalStoragePath = ({
  imageUrl,
  storagePath,
}: ReceiptOriginalPathSource): string | null => {
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

export const hasReceiptOriginalPath = (source: ReceiptOriginalPathSource): boolean =>
  Boolean(getReceiptOriginalStoragePath(source));

export const getExternalLegacyReceiptUrl = ({ imageUrl }: ReceiptOriginalPathSource): string | null => {
  const normalizedImageUrl = getNonEmptyString(imageUrl);
  if (!normalizedImageUrl?.startsWith('http')) return null;

  try {
    const url = new URL(normalizedImageUrl);
    if (url.pathname.includes('/storage/v1/object/public/receipts/')) return null;
  } catch {
    return null;
  }

  return normalizedImageUrl;
};
