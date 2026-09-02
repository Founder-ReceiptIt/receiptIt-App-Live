const DATABASE_NAME = 'receiptit-share-target-v1';
const DATABASE_VERSION = 1;
const PENDING_STORE = 'pending-shares';
const EVENT_STORE = 'share-events';
const MAX_FILES = 10;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_BYTES = 30 * 1024 * 1024;
const MAX_TEXT_LENGTH = 20_000;
const PENDING_TTL_MS = 60 * 60 * 1000;
const EVENT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_DIAGNOSTIC_EVENTS = 100;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

const openDatabase = () => new Promise((resolve, reject) => {
  const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
  request.onupgradeneeded = () => {
    const database = request.result;
    if (!database.objectStoreNames.contains(PENDING_STORE)) database.createObjectStore(PENDING_STORE, { keyPath: 'id' });
    if (!database.objectStoreNames.contains(EVENT_STORE)) database.createObjectStore(EVENT_STORE, { keyPath: 'id' });
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error('share_store_unavailable'));
});

const storeRecord = async (storeName, value) => {
  const database = await openDatabase();
  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readwrite');
      transaction.objectStore(storeName).put(value);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('share_store_failed'));
      transaction.onabort = () => reject(transaction.error || new Error('share_store_aborted'));
    });
  } finally {
    database.close();
  }
};

const deleteExpired = async () => {
  const database = await openDatabase();
  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction([PENDING_STORE, EVENT_STORE], 'readwrite');
      const now = Date.now();
      const clean = (storeName, ttl) => {
        const request = transaction.objectStore(storeName).openCursor();
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) return;
          if (!cursor.value.createdAt || now - cursor.value.createdAt > ttl) cursor.delete();
          cursor.continue();
        };
      };
      clean(PENDING_STORE, PENDING_TTL_MS);
      clean(EVENT_STORE, EVENT_TTL_MS);
      const eventKeysRequest = transaction.objectStore(EVENT_STORE).getAllKeys();
      eventKeysRequest.onsuccess = () => {
        const excessKeys = eventKeysRequest.result.slice(0, Math.max(0, eventKeysRequest.result.length - MAX_DIAGNOSTIC_EVENTS));
        excessKeys.forEach((key) => transaction.objectStore(EVENT_STORE).delete(key));
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('share_cleanup_failed'));
      transaction.onabort = () => reject(transaction.error || new Error('share_cleanup_aborted'));
    });
  } finally {
    database.close();
  }
};

const redirectToApp = (parameter, value) => Response.redirect(
  new URL(`/?${parameter}=${encodeURIComponent(value)}#scan`, self.registration.scope).toString(),
  303,
);

const receiveShare = async (request) => {
  try {
    if (request.headers.get('sec-fetch-site') === 'cross-site') {
      return redirectToApp('shareError', 'share_unavailable');
    }

    const formData = await request.formData();
    const files = formData.getAll('files').filter((entry) => entry instanceof File && entry.size > 0);
    const title = String(formData.get('title') || '');
    const text = String(formData.get('text') || '');
    const url = String(formData.get('url') || '');
    const totalBytes = files.reduce((total, file) => total + file.size, 0);
    let errorCode = null;

    if (files.length > MAX_FILES) errorCode = 'too_many_files';
    else if (files.some((file) => file.size > MAX_FILE_BYTES)) errorCode = 'file_too_large';
    else if (totalBytes > MAX_TOTAL_BYTES) errorCode = 'share_too_large';
    else if (title.length + text.length + url.length > MAX_TEXT_LENGTH) errorCode = 'text_too_large';
    else if (files.length === 0 && !title.trim() && !text.trim() && !url.trim()) errorCode = 'empty_share';

    const id = crypto.randomUUID();
    const createdAt = Date.now();
    await storeRecord(PENDING_STORE, {
      id,
      createdAt,
      files: files.map((file) => ({
        blob: file,
        name: file.name.slice(0, 180),
        type: file.type.slice(0, 100),
        lastModified: file.lastModified || createdAt,
      })),
      title,
      text,
      url,
      errorCode,
    });
    await storeRecord(EVENT_STORE, {
      id: `${createdAt}-${crypto.randomUUID()}`,
      shareId: id,
      createdAt,
      event: errorCode ? 'share_rejected_at_boundary' : 'share_received',
      detailCode: errorCode,
      fileCount: files.length,
      totalBytes,
      fileTypes: [...new Set(files.map((file) => (file.type || 'unknown').slice(0, 100)))].slice(0, 10),
      hasText: Boolean(title.trim() || text.trim()),
      hasUrl: Boolean(url.trim()),
    });
    await deleteExpired();
    return redirectToApp('shareTarget', id);
  } catch {
    return redirectToApp('shareError', 'share_unavailable');
  }
};

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname !== '/share-target') return;

  if (event.request.method === 'POST') {
    event.respondWith(receiveShare(event.request));
    return;
  }

  event.respondWith(redirectToApp('shareError', 'empty_share'));
});
