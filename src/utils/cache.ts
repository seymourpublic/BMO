// Response caching system for BMO
// Caches Claude AI responses to speed up repeated questions

interface CacheEntry {
  response: string;
  timestamp: number;
  expiresAt: number;
}

class ResponseCache {
  private cache: Map<string, CacheEntry>;
  private readonly DEFAULT_TTL = 1000 * 60 * 30; // 30 minutes
  private readonly MAX_ENTRIES = 50; // Prevent memory bloat

  constructor() {
    this.cache = new Map();
    this.loadFromStorage();
  }

  // Generate cache key from conversation history
  private generateKey(messages: any[]): string {
    // Use last 3 messages to create context-aware key
    const recentMessages = messages.slice(-3);
    const keyString = recentMessages
      .map(m => `${m.role}:${m.content}`)
      .join('|');
    
    // Simple hash function
    let hash = 0;
    for (let i = 0; i < keyString.length; i++) {
      const char = keyString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return `bmo_${Math.abs(hash)}`;
  }

  // Get cached response if available and not expired
  get(messages: any[]): string | null {
    const key = this.generateKey(messages);
    const entry = this.cache.get(key);

    if (!entry) {
      console.log('💾 Cache miss - generating new response');
      return null;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      console.log('💾 Cache expired - removing entry');
      this.cache.delete(key);
      this.saveToStorage();
      return null;
    }

    console.log('✅ Cache hit! Using cached response');
    return entry.response;
  }

  // Store response in cache
  set(messages: any[], response: string, ttl: number = this.DEFAULT_TTL): void {
    const key = this.generateKey(messages);

    // Enforce max entries (LRU-style)
    if (this.cache.size >= this.MAX_ENTRIES) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
        console.log('💾 Cache full - removed oldest entry');
      }
    }

    const entry: CacheEntry = {
      response,
      timestamp: Date.now(),
      expiresAt: Date.now() + ttl
    };

    this.cache.set(key, entry);
    this.saveToStorage();
    console.log('💾 Response cached');
  }

  // Clear all cache
  clear(): void {
    this.cache.clear();
    localStorage.removeItem('bmo_response_cache');
    console.log('💾 Cache cleared');
  }

  // Get cache stats
  getStats(): { size: number; entries: number } {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.values()).length
    };
  }

  // Save cache to localStorage
  private saveToStorage(): void {
    try {
      const cacheData = Array.from(this.cache.entries());
      localStorage.setItem('bmo_response_cache', JSON.stringify(cacheData));
    } catch (error) {
      console.error('Failed to save cache to storage:', error);
    }
  }

  // Load cache from localStorage
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem('bmo_response_cache');
      if (stored) {
        const cacheData = JSON.parse(stored);
        this.cache = new Map(cacheData);
        
        // Remove expired entries on load
        let expiredCount = 0;
        for (const [key, entry] of this.cache.entries()) {
          if (Date.now() > entry.expiresAt) {
            this.cache.delete(key);
            expiredCount++;
          }
        }
        
        if (expiredCount > 0) {
          console.log(`💾 Removed ${expiredCount} expired cache entries`);
          this.saveToStorage();
        }
        
        console.log(`💾 Loaded ${this.cache.size} cached responses`);
      }
    } catch (error) {
      console.error('Failed to load cache from storage:', error);
    }
  }
}

// Export singleton instance
export const responseCache = new ResponseCache();
