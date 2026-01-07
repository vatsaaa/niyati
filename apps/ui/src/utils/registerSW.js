/**
 * Service Worker Registration Utility
 * Handles registration, updates, and user notifications
 */

let updatePendingCallback = null;

/**
 * Register callback to be invoked when a service worker update is available
 * @param {Function} callback - Function to call when update is ready
 */
export function onUpdateAvailable(callback) {
  updatePendingCallback = callback;
}

/**
 * Show update notification to user
 */
function showUpdateNotification() {
  if (updatePendingCallback) {
    updatePendingCallback();
  } else {
    // Fallback: simple confirmation dialog
    if (confirm('A new version is available. Refresh to update?')) {
      window.location.reload();
    }
  }
}

/**
 * Register the service worker
 */
export function register() {
  // Check if in production mode (vite preview or production build)
  const isProduction = import.meta.env.PROD || window.location.port === '4173';
  
  if ('serviceWorker' in navigator && isProduction) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then(registration => {
          console.log('Service Worker registered:', registration.scope);
          
          // Handle updates
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // New service worker available, notify user
                console.log('New service worker available');
                showUpdateNotification();
              }
            });
          });

          // Check for updates periodically (every 30 minutes)
          setInterval(() => {
            registration.update();
          }, 30 * 60 * 1000);
        })
        .catch(error => {
          console.warn('Service Worker registration failed:', error);
        });
    });

    // Handle messages from service worker
    navigator.serviceWorker.addEventListener('message', event => {
      if (event.data && event.data.type === 'CACHE_UPDATED') {
        console.log('Cache updated:', event.data.url);
      }
    });
  }
}

/**
 * Unregister the service worker (for debugging)
 */
export async function unregister() {
  if ('serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.ready;
    await registration.unregister();
  }
}
