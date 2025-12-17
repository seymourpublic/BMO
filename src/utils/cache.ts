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
  private readonly MAX_ENTRIES = 100; // Increased from 50 for better hit rate

  constructor() {
    this.cache = new Map();
    this.loadFromStorage();
  }

  // OPTIMIZATION: Smarter cache key generation for higher hit rates
  private generateKey(messages: any[]): string {
    if (messages.length === 0) return 'empty';
    
    const lastMessage = messages[messages.length - 1];
    
    // For simple standalone questions, cache by just the question
    // This dramatically increases cache hit rate for common questions
    const isStandalone = this.isStandaloneQuestion(lastMessage.content);
    
    if (isStandalone && messages.length <= 2) {
      // Single exchange - cache by user question only
      const questionContent = lastMessage.role === 'user' 
        ? lastMessage.content 
        : messages[messages.length - 2]?.content || '';
      
      console.log('💾 Using standalone cache key for simple question');
      return `standalone_${this.hashString(questionContent)}`;
    }
    
    // For contextual questions, use last 3 messages for context awareness
    const recentMessages = messages.slice(-3);
    const keyString = recentMessages
      .map(m => `${m.role}:${m.content}`)
      .join('|');
    
    console.log('💾 Using contextual cache key (3 messages)');
    return `contextual_${this.hashString(keyString)}`;
  }

  // Detect if a question is standalone (doesn't need conversation context)
  private isStandaloneQuestion(content: string): boolean {
    const lowerContent = content.toLowerCase();
    
    // Questions that reference previous context
    const contextualIndicators = [
      'before', 'previous', 'earlier', 'you said', 'you mentioned',
      'that', 'it', 'this', 'them', 'they', 'what about',
      'continue', 'more about', 'tell me more', 'and what',
      'also', 'another', 'next'
    ];
    
    // Check if question references previous context
    const hasContextReference = contextualIndicators.some(indicator => 
      lowerContent.includes(indicator)
    );
    
    // Standalone if: short, no context references, and not a continuation
    return !hasContextReference && 
           content.length < 150 &&
           !lowerContent.startsWith('and ') &&
           !lowerContent.startsWith('or ') &&
           !lowerContent.startsWith('but ');
  }

  // Improved hash function (FNV-1a algorithm for better distribution)
  private hashString(str: string): string {
    // Normalize string for better cache hits (lowercase, trim extra spaces)
    const normalized = str.toLowerCase().trim().replace(/\s+/g, ' ');
    
    let hash = 2166136261; // FNV offset basis
    for (let i = 0; i < normalized.length; i++) {
      hash ^= normalized.charCodeAt(i);
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    return (hash >>> 0).toString(36); // Convert to base36 for shorter keys
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
  getStats(): { size: number; entries: number; hitRate?: number } {
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
      // If localStorage is full, clear old entries
      if (error instanceof Error && error.name === 'QuotaExceededError') {
        console.log('💾 LocalStorage full - clearing old entries');
        this.clearOldEntries();
      }
    }
  }

  // Clear entries older than 1 hour to free up space
  private clearOldEntries(): void {
    const oneHourAgo = Date.now() - (1000 * 60 * 60);
    let cleared = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oneHourAgo) {
        this.cache.delete(key);
        cleared++;
      }
    }
    
    console.log(`💾 Cleared ${cleared} old cache entries`);
    this.saveToStorage();
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
      // Clear corrupted cache
      localStorage.removeItem('bmo_response_cache');
      this.cache = new Map();
    }
  }
}

// Export singleton instance
export const responseCache = new ResponseCache();
