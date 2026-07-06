import crypto from 'crypto';

import { logger } from "./logger";
interface CacheEntry<T> {
  data: T;
  etag: string;
  expiresAt: number;
  createdAt: number;
}

class ResponseCache {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Cleanup expired entries every 60 seconds
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  private generateETag(data: any): string {
    const hash = crypto.createHash('md5').update(JSON.stringify(data)).digest('hex');
    return `"${hash.substring(0, 16)}"`;
  }

  set<T>(key: string, data: T, ttlSeconds: number): { data: T; etag: string } {
    const etag = this.generateETag(data);
    const entry: CacheEntry<T> = {
      data,
      etag,
      expiresAt: Date.now() + ttlSeconds * 1000,
      createdAt: Date.now(),
    };
    this.cache.set(key, entry);
    return { data, etag };
  }

  get<T>(key: string): CacheEntry<T> | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    
    return entry;
  }

  getWithETagCheck<T>(key: string, clientETag: string | undefined): { 
    hit: boolean; 
    notModified: boolean; 
    data?: T; 
    etag?: string 
  } {
    const entry = this.get<T>(key);
    
    if (!entry) {
      return { hit: false, notModified: false };
    }
    
    // Check if client has current version (ETag match)
    if (clientETag && clientETag === entry.etag) {
      return { hit: true, notModified: true, etag: entry.etag };
    }
    
    return { hit: true, notModified: false, data: entry.data, etag: entry.etag };
  }

  invalidate(key: string): void {
    this.cache.delete(key);
  }

  invalidatePattern(pattern: string): void {
    const regex = new RegExp(pattern);
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
      }
    }
  }

  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      logger.info(`🧹 Cache cleanup: removed ${cleaned} expired entries`);
    }
  }

  getStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.cache.clear();
  }
}

// Singleton instance
export const responseCache = new ResponseCache();

// Cache TTL constants (in seconds)
export const CACHE_TTL = {
  STATIC: 300,        // 5 minutes - for rarely changing data (credit packages, platform settings)
  SHORT: 30,          // 30 seconds - for frequently changing data (shared images list)
  MEDIUM: 60,         // 1 minute - for moderately changing data (characters)
  LONG: 180,          // 3 minutes - for computed/aggregated data (search results, popular items)
  USER_SPECIFIC: 15,  // 15 seconds - for user-specific data
  MODELS: 43200,      // 12 hours - models rarely change
};

// Helper to create cache key with user context
export function createCacheKey(endpoint: string, params?: Record<string, any>, userId?: string): string {
  let key = endpoint;
  if (params && Object.keys(params).length > 0) {
    const sortedParams = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('&');
    key += `?${sortedParams}`;
  }
  if (userId) {
    key += `@user:${userId}`;
  }
  return key;
}
