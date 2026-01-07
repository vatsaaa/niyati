import React, { useEffect } from 'react';
import DOMPurify from 'dompurify';

const PrivacyModal = ({ isOpen, onClose, content, isLoading }) => {
  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden shadow-2xl">
        <div className="sticky top-0 bg-slate-900 border-b border-slate-700 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-xl font-semibold text-slate-100">Privacy Policy</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 transition-colors text-2xl leading-none"
          >
            ×
          </button>
        </div>
        <div className="overflow-y-auto p-6 prose prose-invert prose-sm max-w-none">
          {isLoading ? (
            <div className="text-slate-400 text-center py-8">Loading privacy policy...</div>
          ) : (
            <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(content) }} />
          )}
        </div>
        <div className="sticky bottom-0 bg-slate-900 border-t border-slate-700 px-6 py-4 flex justify-end">
          <button
            onClick={onClose}
            className="bg-gradient-to-r from-purple-600 to-amber-600 hover:from-purple-700 hover:to-amber-700 text-white px-6 py-2 rounded-lg shadow-md transition-all duration-200"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default PrivacyModal;
