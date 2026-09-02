export const SHARE_TARGET_MAX_FILES = 10;
export const SHARE_TARGET_MAX_TOTAL_BYTES = 30 * 1024 * 1024;
export const SHARE_TARGET_MAX_TEXT_LENGTH = 20_000;
export const SHARE_TARGET_TTL_MS = 60 * 60 * 1000;

const DATABASE_NAME = 'receiptit-share-target-v1';
const DATABASE_VERSION = 1;
const PENDING_STORE = 'pending-shares';
const EVENT_STORE = 'share-events';

export type PendingShareFile = {
  blob: Blob;
  name: string;
  type: string;
  lastModified: number;
};

export type PendingShareTarget = {
  id: string;
  createdAt: number;
  files: PendingShareFile[];
  title: string;
  text: string;
  url: string;
  errorCode?: string | null;
};

export type ShareTargetEvent =
  | 'auth_interruption'
  | 'payload_opened'
  | 'validation_failed'
  | 'upload_failed'
  | 'duplicate_detected'
  | 'ingestion_started'
  | 'processing_handoff'
  | 'unsupported_url'
  | 'unsupported_content';

const openDatabase = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

  request.onupgradeneeded = () => {
    const database = request.result;
    if (!database.objectStoreNames.contains(PENDING_STORE)) {
      database.createObjectStore(PENDING_STORE, { keyPath: 'id' });
    }
    if (!database.objectStoreNames.contains(EVENT_STORE)) {
      database.createObjectStore(EVENT_STORE, { keyPath: 'id' });
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error('Could not open the shared-receipt inbox.'));
});

const withStore = async <T>(
  storeName: typeof PENDING_STORE | typeof EVENT_STORE,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> => {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(storeName, mode);
      const request = operation(transaction.objectStore(storeName));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Shared-receipt storage failed.'));
      transaction.onabort = () => reject(transaction.error || new Error('Shared-receipt storage was interrupted.'));
    });
  } finally {
    database.close();
  }
};

export const getShareTargetIntentId = (): string | null => {
  const value = new URL(window.location.href).searchParams.get('shareTarget');
  return value && /^[a-f0-9-]{20,64}$/i.test(value) ? value : null;
};

export const getShareTargetErrorCode = (): string | null => (
  new URL(window.location.href).searchParams.get('shareError')
);

export const readPendingShareTarget = async (id: string): Promise<PendingShareTarget | null> => {
  const pending = await withStore<PendingShareTarget | undefined>(PENDING_STORE, 'readonly', (store) => store.get(id));
  if (!pending) return null;

  if (Date.now() - pending.createdAt > SHARE_TARGET_TTL_MS) {
    await removePendingShareTarget(id);
    return null;
  }

  return pending;
};

export const removePendingShareTarget = async (id: string): Promise<void> => {
  await withStore<undefined>(PENDING_STORE, 'readwrite', (store) => store.delete(id));
};

export const recordShareTargetEvent = async (
  shareId: string,
  event: ShareTargetEvent,
  detailCode?: string,
): Promise<void> => {
  const createdAt = Date.now();
  await withStore<IDBValidKey>(EVENT_STORE, 'readwrite', (store) => store.add({
    id: `${createdAt}-${crypto.randomUUID()}`,
    shareId,
    createdAt,
    event,
    detailCode: detailCode?.slice(0, 80) || null,
  }));
};

export const clearShareTargetLocation = (): void => {
  const url = new URL(window.location.href);
  url.searchParams.delete('shareTarget');
  url.searchParams.delete('shareError');
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash || '#scan'}`);
};
