// Enhanced Persistent Cache System
// Uses memory cache + IndexedDB for persistence across sessions

interface CacheEntry {
  key: string;
  value: string;
  timestamp: number;
  ttl: number;
}

class PersistentCache {
  private memoryCache = new Map<string, CacheEntry>();
  private db: IDBDatabase | null = null;
  private readonly DB_NAME = 'BMOCacheDB';
  private readonly STORE_NAME = 'responses';
  private readonly DB_VERSION = 1;
  private initPromise: Promise<void> | null = null;

  constructor() {
    // Initialize automatically
    this.init();
  }

  private async init(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    
    this.initPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        console.warn('IndexedDB not available, using memory cache only');
        resolve();
        return;
      }

      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

      request.onerror = () => {
        console.error('Failed to open IndexedDB');
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('✅ IndexedDB cache initialized');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          const objectStore = db.createObjectStore(this.STORE_NAME, { keyPath: 'key' });
          objectStore.createIndex('timestamp', 'timestamp', { unique: false });
          console.log('📦 IndexedDB object store created');
        }
      };
    });

    return this.initPromise;
  }

  private generateKey(input: any): string {
    return JSON.stringify(input);
  }

  private isExpired(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp > entry.ttl;
  }

  async get(input: any): Promise<string | null> {
    await this.init();
    
    const key = this.generateKey(input);

    // 1. Check memory cache first (instant)
    const memoryCached = this.memoryCache.get(key);
    if (memoryCached && !this.isExpired(memoryCached)) {
      console.log('⚡ Memory cache hit');
      return memoryCached.value;
    }

    // 2. Check IndexedDB (fast, ~10-50ms)
    if (this.db) {
      try {
        const entry = await this.getFromDB(key);
        if (entry && !this.isExpired(entry)) {
          console.log('💾 IndexedDB cache hit');
          // Store in memory for next time
          this.memoryCache.set(key, entry);
          return entry.value;
        }
      } catch (error) {
        console.warn('IndexedDB read error:', error);
      }
    }

    return null;
  }

  async set(input: any, value: string, ttl: number = 3600000): Promise<void> {
    await this.init();
    
    const key = this.generateKey(input);
    const entry: CacheEntry = {
      key,
      value,
      timestamp: Date.now(),
      ttl
    };

    // Store in memory cache
    this.memoryCache.set(key, entry);

    // Store in IndexedDB for persistence
    if (this.db) {
      try {
        await this.setInDB(entry);
      } catch (error) {
        console.warn('IndexedDB write error:', error);
      }
    }
  }

  private async getFromDB(key: string): Promise<CacheEntry | null> {
    return new Promise((resolve) => {
      if (!this.db) {
        resolve(null);
        return;
      }

      const transaction = this.db.transaction([this.STORE_NAME], 'readonly');
      const objectStore = transaction.objectStore(this.STORE_NAME);
      const request = objectStore.get(key);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => {
        console.error('IndexedDB get error:', request.error);
        resolve(null);
      };
    });
  }

  private async setInDB(entry: CacheEntry): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        resolve();
        return;
      }

      const transaction = this.db.transaction([this.STORE_NAME], 'readwrite');
      const objectStore = transaction.objectStore(this.STORE_NAME);
      const request = objectStore.put(entry);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async clear(): Promise<void> {
    // Clear memory cache
    this.memoryCache.clear();

    // Clear IndexedDB
    if (this.db) {
      return new Promise((resolve, reject) => {
        const transaction = this.db!.transaction([this.STORE_NAME], 'readwrite');
        const objectStore = transaction.objectStore(this.STORE_NAME);
        const request = objectStore.clear();

        request.onsuccess = () => {
          console.log('🗑️ Cache cleared');
          resolve();
        };
        request.onerror = () => reject(request.error);
      });
    }
  }

  async cleanExpired(): Promise<void> {
    // Clean memory cache
    for (const [key, entry] of this.memoryCache.entries()) {
      if (this.isExpired(entry)) {
        this.memoryCache.delete(key);
      }
    }

    // Clean IndexedDB
    if (this.db) {
      try {
        const transaction = this.db.transaction([this.STORE_NAME], 'readwrite');
        const objectStore = transaction.objectStore(this.STORE_NAME);
        const index = objectStore.index('timestamp');
        const request = index.openCursor();

        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest).result;
          if (cursor) {
            const entry = cursor.value as CacheEntry;
            if (this.isExpired(entry)) {
              objectStore.delete(entry.key);
            }
            cursor.continue();
          }
        };
      } catch (error) {
        console.warn('Error cleaning expired entries:', error);
      }
    }
  }

  // Get cache statistics
  getStats(): { memory: number; persistent: boolean } {
    return {
      memory: this.memoryCache.size,
      persistent: this.db !== null
    };
  }
}

// Export singleton instance
export const persistentCache = new PersistentCache();

// Auto-clean expired entries every hour
setInterval(() => {
  persistentCache.cleanExpired();
}, 3600000);
