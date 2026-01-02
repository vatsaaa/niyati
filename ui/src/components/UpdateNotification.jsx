import React from 'react'
import { useState, useEffect } from 'react';
import { onUpdateAvailable } from '../utils/registerSW';

/**
 * UpdateNotification Component
 * Shows a notification when a service worker update is available
 */
export default function UpdateNotification() {
  const [showUpdate, setShowUpdate] = useState(false);

  useEffect(() => {
    // Register callback for when update is available
    onUpdateAvailable(() => {
      setShowUpdate(true);
    });
  }, []);

  const handleUpdate = () => {
    window.location.reload();
  };

  const handleDismiss = () => {
    setShowUpdate(false);
  };

  if (!showUpdate) return null;

  return (
    <div className="fixed top-4 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white rounded-lg shadow-lg p-4 z-50 max-w-md animate-slide-down">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <p className="font-medium mb-1">Update Available</p>
          <p className="text-sm text-blue-100">
            A new version of Niyati is ready. Refresh to update.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleUpdate}
            className="px-4 py-2 bg-white text-blue-600 text-sm font-medium rounded-lg hover:bg-blue-50 transition-colors"
          >
            Refresh
          </button>
          <button
            onClick={handleDismiss}
            className="px-3 py-2 text-white hover:text-blue-100 transition-colors"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
