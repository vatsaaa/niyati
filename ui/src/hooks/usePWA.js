import { useState, useEffect } from 'react';

/**
 * Hook to detect if app is running as an installed PWA
 * @returns {Object} PWA status information
 */
export function usePWA() {
  const [isInstalled, setIsInstalled] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [installPromptEvent, setInstallPromptEvent] = useState(null);

  useEffect(() => {
    // Check if running in standalone mode
    const standalone = window.matchMedia('(display-mode: standalone)').matches ||
                      window.navigator.standalone ||
                      document.referrer.includes('android-app://');
    
    setIsStandalone(standalone);
    setIsInstalled(standalone);

    // Listen for beforeinstallprompt event
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setInstallPromptEvent(e);
      setIsInstalled(false);
    };

    // Listen for app installed event
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setInstallPromptEvent(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  /**
   * Trigger the install prompt
   */
  const promptInstall = async () => {
    if (!installPromptEvent) {
      return { outcome: 'unsupported' };
    }

    installPromptEvent.prompt();
    const result = await installPromptEvent.userChoice;
    
    if (result.outcome === 'accepted') {
      setInstallPromptEvent(null);
      setIsInstalled(true);
    }

    return result;
  };

  return {
    isInstalled,
    isStandalone,
    canInstall: !!installPromptEvent,
    promptInstall
  };
}

/**
 * Hook to detect online/offline status
 * @returns {boolean} Current online status
 */
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

/**
 * Hook to manage service worker updates
 * @returns {Object} Service worker update state and actions
 */
export function useServiceWorker() {
  const [waitingWorker, setWaitingWorker] = useState(null);
  const [showReload, setShowReload] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      return;
    }

    const handleControllerChange = () => {
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

    // Check for waiting service worker
    navigator.serviceWorker.ready.then(registration => {
      if (registration.waiting) {
        setWaitingWorker(registration.waiting);
        setShowReload(true);
      }

      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            setWaitingWorker(newWorker);
            setShowReload(true);
          }
        });
      });
    });

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
    };
  }, []);

  /**
   * Activate the waiting service worker
   */
  const updateServiceWorker = () => {
    if (waitingWorker) {
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    }
  };

  return {
    showReload,
    updateServiceWorker
  };
}
