// BMO's on-device database (IndexedDB): photos and the recipe book.
// Every call fails safe: if storage is unavailable, reads come back empty and writes do nothing.

const DB_NAME = 'BMOPhotosDB';
const DB_VERSION = 2;  // v1: photos; v2: + recipes
export type StoreName = 'photos' | 'recipes';
const STORES: StoreName[] = ['photos', 'recipes'];
const OPEN_TIMEOUT_MS = 1500;

let dbPromise: Promise<IDBDatabase | null> | null = null;

const openDb = (): Promise<IDBDatabase | null> => {
  if (dbPromise) return dbPromise;
  const attempt = new Promise<IDBDatabase | null>(resolve => {
    if (typeof indexedDB === 'undefined') return resolve(null);
    // An upgrade can wait for an older BMO tab to close; don't hold the app up meanwhile
    let gaveUp = false;
    const timer = setTimeout(() => { gaveUp = true; resolve(null); }, OPEN_TIMEOUT_MS);
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        for (const store of STORES) {
          if (!request.result.objectStoreNames.contains(store)) request.result.createObjectStore(store, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => {
        clearTimeout(timer);
        const db = request.result;
        // A newer version of BMO (another tab) wants to upgrade: step aside, and reopen next time
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        // Opened after we stopped waiting (an older tab closed): keep it for next time
        if (gaveUp) dbPromise = Promise.resolve(db);
        resolve(db);
      };
      request.onerror = () => { clearTimeout(timer); resolve(null); };
      // Blocked by an older tab: keep waiting (it succeeds once that tab closes); the timer stops the wait
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
  dbPromise = attempt;
  // Unavailable this time: try again on the next call instead of giving up for the whole visit
  attempt.then(db => { if (!db && dbPromise === attempt) dbPromise = null; });
  return attempt;
};

export const runDb = async <T,>(store: StoreName, mode: IDBTransactionMode, action: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> => {
  const db = await openDb();
  if (!db) return null;
  return new Promise(resolve => {
    try {
      const request = action(db.transaction(store, mode).objectStore(store));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
};

export const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
