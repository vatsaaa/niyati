/**
 * PWA Debug Utilities
 * Helper functions for debugging PWA features in development
 */

/**
 * Get service worker registration status
 */
export async function getServiceWorkerStatus() {
  if (!('serviceWorker' in navigator)) {
    return { supported: false };
  }

  try {
    const registration = await navigator.serviceWorker.getRegistration();
    
    return {
      supported: true,
      registered: !!registration,
      active: !!registration?.active,
      waiting: !!registration?.waiting,
      installing: !!registration?.installing,
      scope: registration?.scope,
      updateViaCache: registration?.updateViaCache
    };
  } catch (error) {
    return { supported: true, error: error.message };
  }
}

/**
 * Get cache status and contents
 */
export async function getCacheStatus() {
  if (!('caches' in window)) {
    return { supported: false };
  }

  try {
    const cacheNames = await caches.keys();
    const cacheDetails = await Promise.all(
      cacheNames.map(async (cacheName) => {
        const cache = await caches.open(cacheName);
        const keys = await cache.keys();
        
        return {
          name: cacheName,
          entries: keys.length,
          urls: keys.map(req => req.url).slice(0, 10) // First 10 URLs
        };
      })
    );

    return {
      supported: true,
      caches: cacheDetails,
      totalCaches: cacheNames.length
    };
  } catch (error) {
    return { supported: true, error: error.message };
  }
}

/**
 * Check if app is installed
 */
export function isAppInstalled() {
  // Check if running in standalone mode
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                      window.navigator.standalone ||
                      document.referrer.includes('android-app://');
  
  return {
    installed: isStandalone,
    displayMode: window.matchMedia('(display-mode: standalone)').matches ? 'standalone' : 'browser',
    platform: getPlatform()
  };
}

/**
 * Get platform information
 */
export function getPlatform() {
  const ua = navigator.userAgent;
  
  if (/android/i.test(ua)) return 'Android';
  if (/iPad|iPhone|iPod/.test(ua)) return 'iOS';
  if (/Win/.test(ua)) return 'Windows';
  if (/Mac/.test(ua)) return 'macOS';
  if (/Linux/.test(ua)) return 'Linux';
  
  return 'Unknown';
}

/**
 * Get network information
 */
export function getNetworkInfo() {
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  
  return {
    online: navigator.onLine,
    type: connection?.effectiveType || 'unknown',
    downlink: connection?.downlink || 'unknown',
    rtt: connection?.rtt || 'unknown',
    saveData: connection?.saveData || false
  };
}

/**
 * Clear all PWA caches
 */
export async function clearAllCaches() {
  if (!('caches' in window)) {
    throw new Error('Cache API not supported');
  }

  const cacheNames = await caches.keys();
  await Promise.all(cacheNames.map(name => caches.delete(name)));
  
  return { cleared: cacheNames.length, cacheNames };
}

/**
 * Unregister all service workers
 */
export async function unregisterAllServiceWorkers() {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Service Worker API not supported');
  }

  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map(reg => reg.unregister()));
  
  return { unregistered: registrations.length };
}

/**
 * Force service worker update
 */
export async function forceServiceWorkerUpdate() {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Service Worker API not supported');
  }

  const registration = await navigator.serviceWorker.getRegistration();
  
  if (!registration) {
    throw new Error('No service worker registered');
  }

  await registration.update();
  
  return { updated: true };
}

/**
 * Get comprehensive PWA diagnostics
 */
export async function getPWADiagnostics() {
  const [swStatus, cacheStatus, appStatus, networkInfo] = await Promise.all([
    getServiceWorkerStatus(),
    getCacheStatus(),
    Promise.resolve(isAppInstalled()),
    Promise.resolve(getNetworkInfo())
  ]);

  return {
    serviceWorker: swStatus,
    cache: cacheStatus,
    app: appStatus,
    network: networkInfo,
    timestamp: new Date().toISOString()
  };
}

/**
 * Log PWA diagnostics to console (for debugging)
 */
export async function logPWADiagnostics() {
  const diagnostics = await getPWADiagnostics();
  
  console.group('🔍 PWA Diagnostics');
  console.log('Service Worker:', diagnostics.serviceWorker);
  console.log('Cache:', diagnostics.cache);
  console.log('App:', diagnostics.app);
  console.log('Network:', diagnostics.network);
  console.log('Timestamp:', diagnostics.timestamp);
  console.groupEnd();
  
  return diagnostics;
}

/**
 * Test cache functionality
 */
export async function testCache() {
  if (!('caches' in window)) {
    throw new Error('Cache API not supported');
  }

  const testCacheName = 'test-cache';
  const testUrl = '/test-cache-entry';
  const testResponse = new Response('test data', {
    headers: { 'Content-Type': 'text/plain' }
  });

  try {
    // Open cache
    const cache = await caches.open(testCacheName);
    
    // Write to cache
    await cache.put(testUrl, testResponse);
    
    // Read from cache
    const cachedResponse = await cache.match(testUrl);
    const cachedData = await cachedResponse?.text();
    
    // Clean up
    await caches.delete(testCacheName);
    
    return {
      success: cachedData === 'test data',
      data: cachedData
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// Expose utilities globally in development
if (import.meta.env.DEV) {
  window.pwaDebug = {
    getServiceWorkerStatus,
    getCacheStatus,
    isAppInstalled,
    getNetworkInfo,
    clearAllCaches,
    unregisterAllServiceWorkers,
    forceServiceWorkerUpdate,
    getPWADiagnostics,
    logPWADiagnostics,
    testCache
  };
  
  console.log('💡 PWA Debug utilities available at window.pwaDebug');
}
