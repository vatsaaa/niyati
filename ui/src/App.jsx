import React, { useState, useEffect, useRef } from 'react';
import { buildApiUrl, N8N_WEBHOOK_URL, N8N_WEBHOOK_FALLBACK_URL, CACHE_CONFIG, RETRY_CONFIG } from './config';
import { useAuth, useProfile, useMessages } from './hooks/useAppState';
import LoginForm from './components/LoginForm';
import ProfileHeader from './components/ProfileHeader';
import MessageList from './components/MessageList';
import ChatInput from './components/ChatInput';
import BackgroundStars from './components/BackgroundStars';
import PrivacyModal from './components/PrivacyModal';
import InstallPrompt from './components/InstallPrompt';
import UpdateNotification from './components/UpdateNotification';
import NetworkStatus from './components/NetworkStatus';
import { marked } from 'marked';
import { parseNaturalTime } from './utils/dateParser';
import { extractProfileFields } from './utils/profileExtractor';
import { normalizeDateString, normalizeTimeString } from './utils/normalizers';
import {
  formatTimeForDisplay,
  formatDobForDisplay,
  formatCurrentLocationForDisplay,
  getDisplayPlace,
  formatPlaceFromLocation
} from './utils/formatters';
import { createUUIDv4, getSessionReqId } from './utils/uuid';
import { simpleHash } from './utils/hash';
import { bffFetch, bffFetchWithRetry, sendClientLog } from './services/api';
import { resolveLocationAndTimezone } from './services/geo';
import { processCompleteProfile } from './services/astrology';
import { hasAllRequiredFields, missingProfileFields } from './utils/profile';
import { useChat } from './hooks/useChat';
import { useLogin } from './hooks/useLogin';

const NiyatiChat = () => {
  // Custom hooks for state management
  const auth = useAuth();
  const { profile, updateProfile, resetProfile } = useProfile();
  const { messages, addMessage, clearMessages, setMessages } = useMessages();

  const inputRef = useRef(null);

  // UI state
  const [inputText, setInputText] = useState('');
  const { handleSend, isLoading: chatIsLoading } = useChat(profile, updateProfile, addMessage, auth);
  const [consentChecked, setConsentChecked] = useState(() => {
    try {
      const savedProfile = localStorage.getItem('niyati_user_profile');
      if (savedProfile) {
        const parsed = JSON.parse(savedProfile);
        return !!parsed.user_consentGiven;
      }
    } catch (e) { }
    return false;
  });

  // Privacy modal state
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [privacyHtml, setPrivacyHtml] = useState('');
  const [privacyLoading, setPrivacyLoading] = useState(false);

  const messagesEndRef = useRef(null);
  const privacyInFlightRef = useRef(false);

  const openPrivacy = async () => {
    console.log('openPrivacy clicked');
    // prevent concurrent openings
    if (privacyInFlightRef.current) return;
    privacyInFlightRef.current = true;
    setShowPrivacyModal(true);
    if (privacyHtml) return;
    setPrivacyLoading(true);
    try {
      const res = await fetch('/PRIVACY.md');
      if (!res.ok) console.error('openPrivacy: fetch /PRIVACY.md returned', res.status);
      const md = res.ok ? await res.text() : 'Unable to load Privacy Policy.';

      // Try to lazy-load the markdown renderer and sanitizer from local node_modules
      try {
        const [{ marked }, dompurifyModule] = await Promise.all([import('marked'), import('dompurify')]);
        const DOMPurify = dompurifyModule.default || dompurifyModule;
        // Pass options to suppress deprecation warnings in marked
        const raw = marked.parse(md || '', { mangle: false, headerIds: false });
        const clean = DOMPurify.sanitize(raw);
        setPrivacyHtml(clean);
      } catch (e) {
        console.error('openPrivacy: markdown render/import failed', e);
        // Fallback: render plain text into paragraphs, escaping HTML
        const escaped = (md || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const html = escaped.split(/\n\s*\n/).map(p => `<p>${p.replace(/\n/g, '<br/>')}</p>`).join('');
        setPrivacyHtml(html || '<p>Unable to load Privacy Policy.</p>');
      }
    } catch (e) {
      console.error('openPrivacy: fetch or processing error', e);
      setPrivacyHtml('<p>Unable to load Privacy Policy.</p>');
    } finally {
      setPrivacyLoading(false);
      privacyInFlightRef.current = false;
    }
  };

  const closePrivacy = () => setShowPrivacyModal(false);

  const { handleLogin } = useLogin(auth, profile, updateProfile, addMessage);

  const handleReset = () => {
    if (window.confirm("This will clear your chat history on this device and log you out. Continue?")) {
      auth.logout();
      resetProfile();
      clearMessages();
      // Clear session request id
      try { localStorage.removeItem('niyati_x_request_id'); } catch (e) { }
      // reload to ensure all components pick up cleared storage
      window.location.reload();
    }
  };

  const handleSendWrapper = (e) => {
    e.preventDefault();
    handleSend(inputText, setInputText);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Stars */}
      <BackgroundStars />

      {/* Network Status Banner */}
      <NetworkStatus />

      {!auth.isLoggedIn ? (
        // --- LOGIN SCREEN ---
        <LoginForm
          onLogin={handleLogin}
          countries={auth.countries}
          selectedCountry={auth.selectedCountry}
          setSelectedCountry={auth.setSelectedCountry}
          consentChecked={consentChecked}
          setConsentChecked={setConsentChecked}
          onShowPrivacy={openPrivacy}
        />
      ) : (
        // --- CHAT SCREEN ---
        <div className="w-full max-w-md bg-slate-900/80 backdrop-blur-md border border-slate-700 rounded-2xl shadow-2xl flex flex-col h-[85vh] z-10 relative">

          {/* Header */}
          <ProfileHeader
            profile={profile}
            phoneNumber={auth.phoneNumber}
            getUserCountry={auth.getUserCountry}
            formatDobForDisplay={formatDobForDisplay}
            formatTimeForDisplay={formatTimeForDisplay}
            getDisplayPlace={getDisplayPlace}
            onReset={handleReset}
          />

          {/* Messages Area */}
          <MessageList
            messages={messages}
            isLoading={chatIsLoading}
            messagesEndRef={messagesEndRef}
          />

          {/* Input Area */}
          <ChatInput
            value={inputText}
            onChange={setInputText}
            onSubmit={handleSendWrapper}
            isLoading={chatIsLoading}
            placeholder="Ask something..."
            inputRef={inputRef}
          />
        </div>
      )}

      {/* Global Privacy modal (renders sanitized HTML converted from markdown) */}
      <PrivacyModal
        isOpen={showPrivacyModal}
        onClose={closePrivacy}
        content={privacyHtml}
        isLoading={privacyLoading}
      />

      {/* PWA Features */}
      <InstallPrompt />
      <UpdateNotification />
    </div>
  );
};

export default NiyatiChat;