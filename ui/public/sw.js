/**
 * Niyati Service Worker
 * Advanced caching strategies for optimal offline experience
 */

const VERSION = '1.0.3';
const CACHE_STATIC = `niyati-static-v${VERSION}`;
const CACHE_DYNAMIC = `niyati-dynamic-v${VERSION}`;
const CACHE_API = `niyati-api-v${VERSION}`;
const CACHE_IMAGES = `niyati-images-v${VERSION}`;

const OFFLINE_URL = '/offline.html';

// Files to precache during installation
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/offline.html',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg',
  '/manifest.json'
];

// API endpoints that should be cached
const API_CACHE_PATTERNS = [
  /\/api\/geocode/,
  /\/api\/astrology/,
  /\/api\/telemetry/
];

// Maximum cache sizes
const MAX_API_CACHE_SIZE = 50;
const MAX_IMAGE_CACHE_SIZE = 60;
const MAX_DYNAMIC_CACHE_SIZE = 100;

/**
 * Install event - precache static assets
 */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_STATIC)
      .then((cache) => {
        console.log('[SW] Precaching static assets');
        return cache.addAll(PRECACHE_URLS);
      })
      .then(() => self.skipWaiting())
  );
});

/**
 * Activate event - cleanup old caches
 */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => {
              return name.startsWith('niyati-') && 
                     name !== CACHE_STATIC &&
                     name !== CACHE_DYNAMIC &&
                     name !== CACHE_API &&
                     name !== CACHE_IMAGES;
            })
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        // Enable navigation preload if available
        if (self.registration.navigationPreload) {
          return self.registration.navigationPreload.enable();
        }
      })
      .then(() => self.clients.claim())
  );
});

/**
 * Fetch event - implement caching strategies
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Handle navigation requests (HTML pages)
  if (request.mode === 'navigate') {
    event.respondWith(handleNavigationRequest(request, event));
    return;
  }

  // Handle API requests
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(handleAPIRequest(request));
    return;
  }

  // Handle image requests
  if (request.destination === 'image') {
    event.respondWith(handleImageRequest(request));
    return;
  }

  // Handle static resources (JS, CSS, fonts)
  if (url.origin === self.location.origin) {
    event.respondWith(handleStaticRequest(request));
    return;
  }

  // Default: network-first
  event.respondWith(fetch(request));
});

/**
 * Network-first strategy for navigation (HTML) requests
 * @param {Request} request
 * @param {FetchEvent} [event] - optional, to access preloadResponse
 */
async function handleNavigationRequest(request, event) {
  try {
    // Try navigation preload first if available
    let preloadResponse;
    if (event && event.preloadResponse) {
      try {
        preloadResponse = await event.preloadResponse;
        if (preloadResponse && preloadResponse.ok) {
          return preloadResponse;
        }
      } catch (preloadError) {
        // Preload failed, fall through to network fetch
        console.log('[SW] Preload failed, trying network:', preloadError);
      }
    }

    const networkResponse = await fetch(request);
    
    // Cache successful responses
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(CACHE_DYNAMIC);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.log('[SW] Navigation fetch failed, trying cache:', error);
    
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    // Fallback to offline page
    const offlineResponse = await caches.match(OFFLINE_URL);
    return offlineResponse || new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

/**
 * Network-first with timeout for API requests
 */
async function handleAPIRequest(request) {
  const TIMEOUT = 10000; // 10 seconds

  try {
    // Try network with timeout
    const networkPromise = fetch(request);
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Timeout')), TIMEOUT)
    );

    const response = await Promise.race([networkPromise, timeoutPromise]);

    // Cache successful API responses (except telemetry)
    if (response && response.status === 200 && !request.url.includes('/telemetry')) {
      const cache = await caches.open(CACHE_API);
      cache.put(request, response.clone());
      
      // Limit cache size
      await limitCacheSize(CACHE_API, MAX_API_CACHE_SIZE);
    }

    return response;
  } catch (error) {
    console.log('[SW] API fetch failed, trying cache:', error);
    
    // Try cache as fallback
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    // Return error response
    return new Response(
      JSON.stringify({ 
        error: 'Offline', 
        message: 'This feature requires an internet connection' 
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

/**
 * Cache-first strategy for images
 */
async function handleImageRequest(request) {
  const cachedResponse = await caches.match(request);
  
  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(CACHE_IMAGES);
      cache.put(request, networkResponse.clone());
      
      // Limit cache size
      await limitCacheSize(CACHE_IMAGES, MAX_IMAGE_CACHE_SIZE);
    }

    return networkResponse;
  } catch (error) {
    console.log('[SW] Image fetch failed:', error);
    
    // Could return a placeholder image here
    return new Response('', { status: 404 });
  }
}

/**
 * Cache-first strategy for static resources
 */
async function handleStaticRequest(request) {
  const cachedResponse = await caches.match(request);
  
  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(CACHE_DYNAMIC);
      cache.put(request, networkResponse.clone());
      
      // Limit cache size
      await limitCacheSize(CACHE_DYNAMIC, MAX_DYNAMIC_CACHE_SIZE);
    }

    return networkResponse;
  } catch (error) {
    console.log('[SW] Static resource fetch failed:', error);
    return new Response('', { status: 404 });
  }
}

/**
 * Limit cache size by removing oldest entries
 */
async function limitCacheSize(cacheName, maxSize) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  
  if (keys.length > maxSize) {
    const deleteCount = keys.length - maxSize;
    for (let i = 0; i < deleteCount; i++) {
      await cache.delete(keys[i]);
    }
  }
}

/**
 * Listen for messages from clients
 */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CACHE_URLS') {
    event.waitUntil(
      caches.open(CACHE_DYNAMIC).then((cache) => {
        return cache.addAll(event.data.urls);
      })
    );
  }
});
