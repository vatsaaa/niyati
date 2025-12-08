import { useState, useEffect } from 'react';

/**
 * InstallPrompt Component
 * Shows a prompt to install the PWA when appropriate
 */
export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      setDeferredPrompt(e);
      
      // Show prompt after user has visited 3+ times
      const visitCount = parseInt(localStorage.getItem('niyati_visitCount') || '0') + 1;
      localStorage.setItem('niyati_visitCount', visitCount);
      
      const dismissed = localStorage.getItem('niyati_installPromptDismissed');
      const installed = localStorage.getItem('niyati_appInstalled');
      
      if (visitCount >= 3 && !dismissed && !installed) {
        // Delay showing prompt to avoid interrupting initial experience
        setTimeout(() => setShowPrompt(true), 3000);
      }
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Check if app is already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      localStorage.setItem('niyati_appInstalled', 'true');
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    console.log(`User ${outcome === 'accepted' ? 'accepted' : 'dismissed'} install`);
    
    if (outcome === 'accepted') {
      localStorage.setItem('niyati_appInstalled', 'true');
    }
    
    setDeferredPrompt(null);
    setShowPrompt(false);
  };

  const handleDismiss = () => {
    localStorage.setItem('niyati_installPromptDismissed', 'true');
    setShowPrompt(false);
  };

  const handleRemindLater = () => {
    // Clear the dismissal flag but hide for now
    setShowPrompt(false);
  };

  if (!showPrompt) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 bg-white rounded-lg shadow-2xl p-4 border border-gray-200 z-50 max-w-md mx-auto animate-slide-up">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0">
          <img src="/icons/icon-192.svg" alt="Niyati" className="w-12 h-12 rounded-lg" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-gray-900 mb-1">Install Niyati</h3>
          <p className="text-sm text-gray-600 mb-3">
            Get quick access and offline support by installing our app on your device.
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleInstall}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              Install
            </button>
            <button
              onClick={handleRemindLater}
              className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
            >
              Later
            </button>
            <button
              onClick={handleDismiss}
              className="px-3 py-2 text-gray-500 text-sm font-medium hover:text-gray-700 transition-colors"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
