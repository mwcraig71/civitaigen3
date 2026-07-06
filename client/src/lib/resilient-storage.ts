/**
 * Resilient Storage Layer
 * 
 * Provides localStorage/sessionStorage-like interface that gracefully falls back
 * to in-memory storage when browser storage is unavailable (e.g., Safari private mode).
 * 
 * Safari private browsing throws QUOTA_EXCEEDED_ERR on the first write attempt,
 * which can cause infinite re-render loops if not handled properly.
 */

// In-memory fallback storage
const memoryStorage: Record<string, string> = {};

// Track whether we've detected storage is unavailable
let storageUnavailable = false;
let storageCheckDone = false;

/**
 * Test if localStorage/sessionStorage is actually available and writable
 */
function testStorageAvailability(): boolean {
  if (storageCheckDone) {
    return !storageUnavailable;
  }
  
  try {
    const testKey = '__storage_test__';
    localStorage.setItem(testKey, 'test');
    localStorage.removeItem(testKey);
    storageCheckDone = true;
    storageUnavailable = false;
    return true;
  } catch (e) {
    // Safari private mode throws QuotaExceededError
    console.log('🔒 Browser storage unavailable (private mode?), using in-memory fallback');
    storageCheckDone = true;
    storageUnavailable = true;
    return false;
  }
}

/**
 * Resilient storage interface that falls back to memory when browser storage is blocked
 */
export const resilientStorage = {
  /**
   * Check if we're using fallback (in-memory) storage
   */
  isUsingFallback(): boolean {
    testStorageAvailability();
    return storageUnavailable;
  },

  /**
   * Get item from storage (localStorage with memory fallback)
   */
  getItem(key: string): string | null {
    if (!testStorageAvailability()) {
      return memoryStorage[key] ?? null;
    }
    
    try {
      return localStorage.getItem(key);
    } catch {
      return memoryStorage[key] ?? null;
    }
  },

  /**
   * Set item in storage (localStorage with memory fallback)
   */
  setItem(key: string, value: string): void {
    // Always store in memory as backup
    memoryStorage[key] = value;
    
    if (!testStorageAvailability()) {
      return;
    }
    
    try {
      localStorage.setItem(key, value);
    } catch {
      // Silently use memory fallback
    }
  },

  /**
   * Remove item from storage
   */
  removeItem(key: string): void {
    delete memoryStorage[key];
    
    if (!testStorageAvailability()) {
      return;
    }
    
    try {
      localStorage.removeItem(key);
    } catch {
      // Silently ignore
    }
  },

  /**
   * Get item from session storage with memory fallback
   */
  getSessionItem(key: string): string | null {
    if (!testStorageAvailability()) {
      return memoryStorage[`session:${key}`] ?? null;
    }
    
    try {
      return sessionStorage.getItem(key);
    } catch {
      return memoryStorage[`session:${key}`] ?? null;
    }
  },

  /**
   * Set item in session storage with memory fallback
   */
  setSessionItem(key: string, value: string): void {
    memoryStorage[`session:${key}`] = value;
    
    if (!testStorageAvailability()) {
      return;
    }
    
    try {
      sessionStorage.setItem(key, value);
    } catch {
      // Silently use memory fallback
    }
  }
};
