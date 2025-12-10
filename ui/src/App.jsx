import React, { useState, useEffect, useRef } from 'react';
import { buildApiUrl, N8N_WEBHOOK_URL, CACHE_CONFIG, RETRY_CONFIG } from './config';
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
import { parseNaturalDate, parseNaturalTime } from './utils/dateParser';

const NiyatiChat = () => {
  // Custom hooks for state management
  const auth = useAuth();
  const { profile, updateProfile, resetProfile } = useProfile();
  const { messages, addMessage, clearMessages, setMessages } = useMessages();

  // UI state
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [consentChecked, setConsentChecked] = useState(() => {
    try {
      const savedProfile = localStorage.getItem('niyati_user_profile');
      if (savedProfile) {
        const parsed = JSON.parse(savedProfile);
        return !!parsed.user_consentGiven;
      }
    } catch (e) {}
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
        const html = escaped.split(/\n\s*\n/).map(p => `<p>${p.replace(/\n/g,'<br/>')}</p>`).join('');
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

  // Auto-scroll
  useEffect(() => {
    if (auth.isLoggedIn) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, auth.isLoggedIn]);

  // Persist canonical profile whenever it changes
  useEffect(() => {
    try { localStorage.setItem('niyati_user_profile', JSON.stringify(profile)); } catch (e) {}
  }, [profile]);

  // 3. LOGIN HANDLER
  // Helper: create a UUIDv4 for request correlation and a wrapper to call BFF with `x-request-id` header
  function createUUIDv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  // Session-level request id management: persist in localStorage under `niyati_x_request_id`
  function getSessionReqId() {
    try {
      let id = localStorage.getItem('niyati_x_request_id');
      if (!id) {
        id = createUUIDv4();
        try { localStorage.setItem('niyati_x_request_id', id); } catch (e) {}
      }
      return id;
    } catch (e) {
      return createUUIDv4();
    }
  }

  // bffFetch: uses versioned API endpoint and adds x-request-id header for request tracing
  async function bffFetch(pathOrUrl, options = {}) {
    // Determine final URL
    let url;
    if (typeof pathOrUrl === 'string' && (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://'))) {
      url = pathOrUrl; // Absolute URL, use as-is
    } else {
      url = buildApiUrl(pathOrUrl); // Build versioned API URL
    }

    const reqId = getSessionReqId();

    const headers = new Headers(options.headers || {});
    headers.set('x-request-id', reqId);

    const merged = { ...options, headers };
    console.log('[bffFetch] Calling:', url, 'with options:', merged);
    return fetch(url, merged);
  }

  // bffFetchWithRetry: wrapper that retries transient errors with exponential backoff
  // Uses config values for retry parameters
  async function bffFetchWithRetry(pathOrUrl, options = {}, opts = {}) {
    const retries = typeof opts.retries === 'number' ? opts.retries : RETRY_CONFIG.maxRetries;
    const baseDelay = typeof opts.baseDelayMs === 'number' ? opts.baseDelayMs : RETRY_CONFIG.baseDelayMs;
    const retryOnStatus = Array.isArray(opts.retryOnStatus) ? opts.retryOnStatus : [502, 503, 504, 429];

    let attempt = 0;
    while (true) {
      try {
        const res = await bffFetch(pathOrUrl, options);
        // If status is in retry list, throw to trigger retry
        if (retryOnStatus.includes(res.status) && attempt < retries) {
          throw new Error(`Transient status ${res.status}`);
        }
        return res;
      } catch (err) {
        attempt++;
        if (attempt > retries) throw err;
        const delay = baseDelay * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 100);
        // small sleep
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  // Simple deterministic-ish hash for caching keys (not cryptographic)
  function simpleHash(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h.toString(16);
  }

  // Send a small, sanitized telemetry event to the BFF for central logging.
  // Only send when the user has given consent in profile (best-effort privacy).
  async function sendClientLog(tag, meta = {}) {
    try {
      // respect user consent
      if (!profile || !profile.user_consentGiven) return;
      const safe = { ...meta };
      // remove obvious PII keys if accidentally passed
      delete safe.user_name; delete safe.user_dob; delete safe.user_placeOfBirth; delete safe.user_timeOfBirth; delete safe.phoneNumber;

      // fire-and-forget to BFF telemetry endpoint (bffFetch attaches x-request-id)
      await bffFetch('/telemetry/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag, meta: safe, ts: Date.now() })
      });
    } catch (e) {
      // best-effort, do not surface to user
    }
  }
  const handleLogin = async (phone, country) => {
    const fullPhone = `${country.dialCode}-${phone.trim()}`;
    
    // Use auth hook to login
    auth.login(phone, country);

    // Generate a fresh session-level request id for this login session
    try { localStorage.setItem('niyati_x_request_id', createUUIDv4()); } catch (e) {}

    // Get current location and persist along with consent
    let currentLocationData = null;
    try {
      // Call the current location API (BFF) with request-id header
      const locationResponse = await bffFetch('/geocode/current-location');
      if (locationResponse.ok) {
        const locationData = await locationResponse.json();
        if (locationData.status === 'ok' && locationData.data && locationData.data.location) {
          currentLocationData = locationData.data.location;
        }
      }
    } catch (e) {
      console.warn('Failed to fetch current location:', e);
      // Continue with login even if location fetch fails
    }

    // Persist consent and current location in canonical profile shape
    try {
      const existing = profile;
      updateProfile({ 
        user_consentGiven: true,
        user_currentLocation: currentLocationData || profile.user_currentLocation || '',
        updatedAt: new Date().toISOString() 
      });
      
      // Check if profile is complete after consent and process astrology
      const updatedProfileWithConsent = {
        ...existing,
        user_consentGiven: true,
        user_currentLocation: currentLocationData || existing.user_currentLocation || ''
      };
      
      if (isProfileComplete(updatedProfileWithConsent)) {
        console.log('Profile complete after login, processing astrology...');
        processCompleteProfile(updatedProfileWithConsent);
      }
    } catch (e) {}
  };

  // Get country data for logged-in user
  const getUserCountry = () => {
    const savedCountryCode = localStorage.getItem('niyati_user_country_code') || 'US';
    return auth.countries.find(c => c.code === savedCountryCode) || auth.countries[0] || { code: 'US', name: 'United States', dialCode: '+1', flag: '🇺🇸', phoneLength: 10 };
  };

  // 4. LOGOUT / RESET HANDLER
  const handleReset = () => {
    if (window.confirm("This will clear your chat history on this device and log you out. Continue?")) {
      auth.logout();
      resetProfile();
      clearMessages();
      // Clear session request id
      try { localStorage.removeItem('niyati_x_request_id'); } catch (e) {}
      // reload to ensure all components pick up cleared storage
      window.location.reload();
    }
  };

  // 5. SEND MESSAGE FUNCTION
  const handleSend = async (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const userMessage = {
      id: Date.now(),
      text: inputText,
      sender: 'user',
      timestamp: new Date()
    };
    addMessage(userMessage);
    setInputText('');
    setIsLoading(true);

    // --- Chat-extraction (silent) ---
    // Run extraction heuristics on the user's message and silently persist values for later review.
    const extracted = await extractProfileFields(userMessage.text);
    console.log('Extracted profile fields:', extracted);
    
    // Prepare normalized message by replacing extracted values with normalized versions
    let normalizedMessage = userMessage.text;
    
    if (extracted.name || extracted.dob || extracted.placeOfBirth || extracted.timeOfBirth) {
      const updated = {
        user_name: extracted.name || profile.user_name,
        user_dob: extracted.dob ? (normalizeDateString(extracted.dob) || extracted.dob) : profile.user_dob,
        user_placeOfBirth: extracted.placeOfBirth || profile.user_placeOfBirth,
        user_timeOfBirth: extracted.timeOfBirth ? (normalizeTimeString(extracted.timeOfBirth) || extracted.timeOfBirth) : profile.user_timeOfBirth,
        user_currentLocation: profile.user_currentLocation,
        user_consentGiven: profile.user_consentGiven,
        user_verified: {
          ...(profile.user_verified || {}),
          ...(extracted.name ? { name: false } : {}),
          ...(extracted.dob ? { dob: false } : {}),
          ...(extracted.placeOfBirth ? { placeOfBirth: false } : {}),
          ...(extracted.timeOfBirth ? { timeOfBirth: false } : {})
        }
      };
      console.log('Updated profile with extracted data:', updated);
      
      // Replace extracted values in the message with normalized versions
      if (extracted.dob && updated.user_dob) {
        const formattedDob = formatDobForDisplay(updated.user_dob, auth.countries);
        if (formattedDob) {
          normalizedMessage = normalizedMessage.replace(extracted.dob, formattedDob);
          console.log('Replaced date in message:', extracted.dob, '->', formattedDob);
        }
      }
      
      if (extracted.timeOfBirth && updated.user_timeOfBirth) {
        normalizedMessage = normalizedMessage.replace(extracted.timeOfBirth, updated.user_timeOfBirth);
        console.log('Replaced time in message:', extracted.timeOfBirth, '->', updated.user_timeOfBirth);
      }
      
      updateProfile(updated);
      
      // Process astrology in background if profile is complete
      if (isProfileComplete(updated)) {
        console.log('Profile is complete, processing astrology...');
        processCompleteProfile(updated);
      }
      
      // Background: resolve the extracted placeOfBirth to a structured place (geocode)
      if (extracted.placeOfBirth) {
        (async () => {
          try {
            const { location } = await resolveLocationAndTimezone(extracted.placeOfBirth);
            if (location) {
              const formatted = formatPlaceFromLocation(location);
              const candidate = {
                ...profile,
                user_placeOfBirth: formatted || extracted.placeOfBirth
              };
              updateProfile(candidate);

              // After resolving place, optionally trigger astrology if profile is now complete
              if (isProfileComplete(candidate)) {
                processCompleteProfile(candidate);
              }
            }
          } catch (err) {
            // fail silently
            console.warn('Place resolution failed:', err);
          }
        })();
      }

      // No chat confirmation message — the UI header will surface extracted details for manual review.
    }

    try {
      // Use the session request id once so header and body match exactly
      const webhookReqId = getSessionReqId();
      // Log the webhook request id for quick local debugging and correlation
      console.log('N8N webhook reqId:', webhookReqId);
      console.log('N8N webhook URL:', N8N_WEBHOOK_URL);
      
      // Create AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout
      
      const response = await fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-request-id': webhookReqId,
          'ngrok-skip-browser-warning': 'true'
        },
        body: JSON.stringify({
          message: normalizedMessage, // Use normalized message with replaced values
          sessionId: auth.phoneNumber, // <--- KEY FIX: Send Phone Number as ID
          metadata: { reqId: webhookReqId }
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // Emit a small telemetry event so the server-side logs can correlate webhook sends.
      try {
        // fire-and-forget; sendClientLog respects consent and sanitizes payload
        sendClientLog('webhook.sent', { reqId: webhookReqId, status: response && response.status });
      } catch (e) {
        // ignore telemetry errors
      }

      let botResponseText = "The stars are clouded... I could not reach the server.";

      if (response.ok) {
        const data = await response.json();
        botResponseText = data.output || data.text || JSON.stringify(data);
        
        if (typeof botResponseText === 'string' && botResponseText.startsWith('"') && botResponseText.endsWith('"')) {
          botResponseText = botResponseText.slice(1, -1);
        }
      } 

      const botMessage = {
        id: Date.now() + 1,
        text: botResponseText,
        sender: 'bot',
        timestamp: new Date()
      };
      addMessage(botMessage);

    } catch (error) {
      console.error("Error:", error);
      console.error("Error name:", error.name);
      console.error("Error message:", error.message);
      console.error("Error stack:", error.stack);
      
      let errorMessage = "I cannot reach the server. Please check your connection.";
      
      if (error.name === 'AbortError') {
        errorMessage = "The request took too long to respond. The AI might be processing your message. Please try again in a moment.";
      } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
        errorMessage = "Network error: Unable to connect to the chat service. Please check if the service is running.";
      }
      
      addMessage({
        id: Date.now() + 1,
        text: errorMessage,
        sender: 'bot',
        isError: true,
        timestamp: new Date()
      });
    } finally {
      setIsLoading(false);
    }
  };

  // --- Helper: simple profile extraction heuristics ---
  async function extractProfileFields(text) {
    const lower = text.toLowerCase();
    const result = {};

    // Name patterns
    const nameMatch = text.match(/(?:my name is|i am|i'm)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})/i);
    if (nameMatch) result.name = nameMatch[1].trim();

    // DoB patterns (YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY, 12th Jan 1990, or '11 November 2005')
    const dobMatchISO = text.match(/(\d{4}-\d{2}-\d{2})/);
    const dobMatchDMY = text.match(/(\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4})/);
    // Matches things like '12-Jan-1990' or '12 Jan 1990' (with separators or spaces)
    const dobMatchText = text.match(/(\d{1,2}[\/\.-]\s*[A-Za-z]{3,9}[\/\.-]\s*\d{2,4})/i);
    const dobMatchTextSpace = text.match(/(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4})/i);
    if (dobMatchISO) result.dob = dobMatchISO[1];
    else if (dobMatchDMY) result.dob = dobMatchDMY[1];
    else if (dobMatchText) result.dob = dobMatchText[1];
    else if (dobMatchTextSpace) result.dob = dobMatchTextSpace[1];
    else {
      // Try natural language parsing for formats like "the fifteenth of March, 1990"
      try {
        const chronoResult = await parseNaturalDate(text);
        if (chronoResult && chronoResult.confidence > 0.6) {
          console.log('Extracted date using Chrono:', chronoResult);
          result.dob = chronoResult.date; // Already in YYYY-MM-DD format
        }
      } catch (e) {
        console.debug('Chrono date extraction failed:', e);
      }
    }

    // Place of birth patterns
    // Match common variants: "born in", "born at", "from", and forms like
    // "place of my birth is", "place of birth is", "my place of birth is",
    // as well as "birth place", "birthplace", and variants that include 'was'/'is'.
    const placeMatch = text.match(/(?:born in|born at|from|i was born in|place of my birth(?: is| was)?|place of birth(?: is| was|[:\s]*)|my place of birth(?: is| was)?|birthplace(?: is| was|[:\s]*)|birth\s*place(?: is| was|[:\s]*)|my birth place(?: is| was|[:\s]*))\s*([A-Za-z0-9 ,.\-']{2,100})/i);
    if (placeMatch) {
      // Trim and defensively strip common leading verbs/articles that may be captured
      let p = placeMatch[1].trim();
      p = p.replace(/^(?:was|is|my|the|born in|born at)\b[:\s-]*/i, '').trim();
      result.placeOfBirth = p;
    }

    // Time of birth patterns (e.g., 7:30 PM, 19:30, 7 pm, 11:00:04 am)
    const timeMatchSecAmPm = text.match(/(\d{1,2}:\d{2}:\d{2}\s*(?:am|pm))/i);
    const timeMatchSec24 = text.match(/(\b\d{1,2}:\d{2}:\d{2}\b)/);
    const timeMatchMinAmPm = text.match(/(\d{1,2}:\d{2}\s*(?:am|pm))/i);
    const timeMatchMin24 = text.match(/(\b\d{1,2}:\d{2}\b)/);
    const timeMatchHourAmPm = text.match(/(\b\d{1,2}\s*(?:am|pm)\b)/i);
    if (timeMatchSecAmPm) result.timeOfBirth = timeMatchSecAmPm[1].trim();
    else if (timeMatchSec24) result.timeOfBirth = timeMatchSec24[1].trim();
    else if (timeMatchMinAmPm) result.timeOfBirth = timeMatchMinAmPm[1].trim();
    else if (timeMatchMin24) result.timeOfBirth = timeMatchMin24[1].trim();
    else if (timeMatchHourAmPm) result.timeOfBirth = timeMatchHourAmPm[1].trim();
    else {
      // Try natural language parsing for formats like "half past two in the afternoon"
      try {
        const chronoResult = await parseNaturalTime(text);
        if (chronoResult && chronoResult.confidence > 0.6) {
          console.log('Extracted time using Chrono:', chronoResult);
          result.timeOfBirth = chronoResult.time; // Already in HH:MM:SS format
        }
      } catch (e) {
        console.debug('Chrono time extraction failed:', e);
      }
    }

    return result;
  }

  // Normalize time strings to HH:MM (24-hour) when possible
  // Normalize time string to HH:MM:SS format
  // Now enhanced with Chrono for natural language time parsing
  function normalizeTimeString(s) {
    if (!s || typeof s !== 'string') return '';
    let t = s.trim();
    
    // For complex natural language time formats we previously used Chrono.
    // Chrono parsing is now loaded lazily via the parser util; here we keep
    // a lightweight regex-based fallback to avoid adding chrono to hot paths.
    
    // Handle AM/PM with optional seconds: hh:mm:ss am/pm or hh:mm am/pm or hh am/pm
    const ampmMatch = t.match(/^(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*(am|pm)$/i);
    if (ampmMatch) {
      let h = parseInt(ampmMatch[1], 10);
      const m = ampmMatch[2] ? parseInt(ampmMatch[2], 10) : 0;
      const s = ampmMatch[3] ? parseInt(ampmMatch[3], 10) : 0;
      const ampm = ampmMatch[4].toLowerCase();
      if (ampm === 'pm' && h < 12) h += 12;
      if (ampm === 'am' && h === 12) h = 0;
      if (isNaN(h) || isNaN(m) || isNaN(s)) return '';
      return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    }
    // Handle 24-hour hh:mm:ss or hh:mm
    const mmss = t.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
    if (mmss) {
      let h = parseInt(mmss[1],10);
      let m = parseInt(mmss[2],10);
      let s = parseInt(mmss[3],10);
      if (h < 0 || h > 23 || m < 0 || m > 59 || s < 0 || s > 59) return '';
      return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    }
    const mm = t.match(/^(\d{1,2}):(\d{2})$/);
    if (mm) {
      let h = parseInt(mm[1],10);
      let m = parseInt(mm[2],10);
      if (h < 0 || h > 23 || m < 0 || m > 59) return '';
      return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`;
    }
    // Plain hour like '7' -> 07:00:00
    const justH = t.match(/^(\d{1,2})$/);
    if (justH) {
      let h = parseInt(justH[1],10);
      if (h >=0 && h <=23) return `${String(h).padStart(2,'0')}:00:00`;
    }
    
    // Final fallback: try Chrono with lower confidence threshold
    try {
      const chronoResult = parseNaturalTime(t);
      if (chronoResult && chronoResult.confidence > 0.5) {
        console.debug('Using Chrono time result with confidence:', chronoResult.confidence);
        return chronoResult.time;
      }
    } catch (e) {
      // ignore
    }
    
    return '';
  }

  // Format stored 24-hour HH:MM:SS to display HH:MM:SS AM/PM
  function formatTimeForDisplay(rawTime) {
    if (!rawTime) return null;
    const t = rawTime.trim();
    // Expect HH:MM:SS or HH:MM
    const m = t.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (!m) return null;
    let h = parseInt(m[1],10);
    const min = m[2];
    const sec = m[3] || '00';
    const ampm = h >= 12 ? 'PM' : 'AM';
    let dispH = h % 12;
    if (dispH === 0) dispH = 12;
    return `${String(dispH).padStart(2,'0')}:${min}:${sec} ${ampm}`;
  }

  // Very small date normalizer: tries to convert common forms to YYYY-MM-DD
  // countryHint: use country code (e.g., 'US') to disambiguate MM/DD vs DD/MM
  // Now enhanced with Chrono for natural language parsing
  function normalizeDateString(s, countryHint = 'US') {
    if (!s || typeof s !== 'string') return null;
    s = s.trim();
    
    // YYYY-MM-DD already
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) return s;

    // For complex natural language date formats we previously used Chrono.
    // Chrono parsing is now provided as a lazy-loaded utility; here keep the
    // fast synchronous path (Date.parse + numeric parsing) to avoid importing
    // chrono on every render.

    // Try textual parse (e.g., '12 Jan 1990' or 'Jan 12 1990')
    const textDate = Date.parse(s);
    if (!isNaN(textDate)) {
      const dt = new Date(textDate);
      return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    }

    // Numeric forms: D/M/Y or M/D/Y
    const dmy = s.match(/^(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{2,4})$/);
    if (dmy) {
      let p1 = parseInt(dmy[1], 10);
      let p2 = parseInt(dmy[2], 10);
      let p3 = dmy[3];
      if (p3.length === 2) {
        p3 = parseInt(p3, 10) > 30 ? '19' + p3 : '20' + p3;
      }
      let day, month;
      // If country is US, assume MM/DD/YYYY, otherwise DD/MM/YYYY
      if (countryHint && countryHint.toUpperCase() === 'US') {
        month = String(p1).padStart(2, '0');
        day = String(p2).padStart(2, '0');
      } else {
        day = String(p1).padStart(2, '0');
        month = String(p2).padStart(2, '0');
      }
      const year = String(p3);
      // Basic validation
      if (parseInt(month, 10) < 1 || parseInt(month, 10) > 12) return null;
      if (parseInt(day, 10) < 1 || parseInt(day, 10) > 31) return null;
      return `${year}-${month}-${day}`;
    }
    
    // Final fallback: do not call Chrono synchronously here.
    // If necessary, use the server-side parser or call the async parser from
    // extraction flows where awaiting is safe.

    return null;
  }

  // Format ISO-like YYYY-MM-DD (or parseable strings) to DD-MMM-YYYY for display
  function formatDobForDisplay(rawDob, countryHint = 'US') {
    if (!rawDob) return null;
    // If it's already ISO-like, use it; else try to normalize with hint
    let iso = null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(rawDob)) iso = rawDob;
    else iso = normalizeDateString(rawDob, countryHint);
    if (!iso) return null;
    const [y, m, d] = iso.split('-').map(part => parseInt(part, 10));
    if (!y || !m || !d) return null;
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${String(d).padStart(2, '0')}-${months[m-1]}-${y}`;
  }

  // Format current location object for display
  function formatCurrentLocationForDisplay(currentLocation) {
    if (!currentLocation) return null;
    if (typeof currentLocation === 'string') return currentLocation;
    if (typeof currentLocation === 'object') {
      const parts = [];
      if (currentLocation.city) parts.push(currentLocation.city);
      if (currentLocation.state) parts.push(currentLocation.state);
      if (currentLocation.country) parts.push(currentLocation.country);
      return parts.join(', ') || null;
    }
    return null;
  }

  // Return the best display string for user's place of birth.
  // Prefer normalized `user_placeOfBirth`; if absent, try to extract an ASCII-friendly fragment from the raw provider string.
  function getDisplayPlace(profileObj) {
    if (!profileObj) return '—';
    if (profileObj.user_placeOfBirth) return profileObj.user_placeOfBirth;
    const raw = profileObj.placeOfBirth_raw || profileObj.user_placeOfBirth || '';
    if (!raw) return '—';
    // If raw contains ASCII fragment separated by commas, prefer that
    const parts = raw.split(',').map(p => p.trim()).filter(Boolean);
    const ascii = parts.find(p => /[A-Za-z]/.test(p));
    if (ascii) return ascii;
    return raw;
  }

  // Format a geocoding location object into a single place string for display
  function formatPlaceFromLocation(location) {
    if (!location) return '';
    // location may have different shapes depending on provider: try common keys
    const city = location.city || location.town || location.village || location.name || '';
    const state = location.state || location.region || location.county || '';

    // try multiple possible country fields and country code
    let country = location.country || location.country_name || '';
    let countryCode = (location.countryCode || location.country_code || (location.address && (location.address.country_code || location.address.countryCode)) || '').toString();
    country = country || (location.address && (location.address.country || location.address.country_name)) || '';

    // If the returned country is non-ASCII (localized), but we have a country code, map it to our countries list (English name)
    const hasNonAscii = (str) => /[^\u0000-\u007F]/.test(str || '');
    if ((!country || hasNonAscii(country)) && countryCode) {
      try {
        const code = countryCode.toString().toUpperCase();
        const mapped = (countries || []).find(c => (c.code || '').toString().toUpperCase() === code);
        if (mapped && mapped.name) country = mapped.name;
      } catch (e) {
        // ignore mapping errors
      }
    }

    // For city: if it contains non-ASCII characters, try to extract an ASCII fragment from display_name
    let cityToUse = city || '';
    if (hasNonAscii(cityToUse) && location.display_name && typeof location.display_name === 'string') {
      const partsFromDisplay = location.display_name.split(',').map(s => s.trim()).filter(Boolean);
      // prefer the first segment that contains ASCII letters
      const asciiCandidate = partsFromDisplay.find(p => /[A-Za-z]/.test(p));
      if (asciiCandidate) cityToUse = asciiCandidate;
    }

    // If state or country are missing, try to extract them from display_name
    let stateToUse = state || '';
    let countryToUse = country || '';
    if ((!stateToUse || !countryToUse) && location.display_name && typeof location.display_name === 'string') {
      const partsFromDisplay = location.display_name.split(',').map(s => s.trim()).filter(Boolean);
      if (!cityToUse && partsFromDisplay[0]) cityToUse = partsFromDisplay[0];
      if (!stateToUse && partsFromDisplay[1]) stateToUse = partsFromDisplay[1];
      if (!countryToUse && partsFromDisplay.length > 0) countryToUse = partsFromDisplay[partsFromDisplay.length - 1];
    }

    const parts = [cityToUse, stateToUse, countryToUse].map(p => (p || '').trim()).filter(p => p.length > 0);
    if (parts.length > 0) return parts.join(', ');
    // final fallbacks: try to use display_name or formatted if available
    return location.display_name || location.formatted || '';
  }

  // Check if user profile is complete for astrology calculations
  function isProfileComplete(profile) {
    return !!(profile.user_name && 
             profile.user_dob && 
             profile.user_placeOfBirth && 
             profile.user_timeOfBirth && 
             profile.user_consentGiven);
  }

  // Determine the appropriate geocoding API based on location format
  function determineGeocodingEndpoint(location) {
    if (!location) return null;
    
    // Clean the location string and split by common separators
    const cleaned = location.trim();
    const parts = cleaned.split(/[,;|]/g).map(p => p.trim()).filter(p => p.length > 0);
    
    // Check if it looks like structured address (street, city, state, country)
    const hasStreetIndicators = /\b(\d+\s+\w+|road|street|avenue|lane|drive|blvd|ave|rd|st|ln|dr)\b/i.test(cleaned);
    
    if (hasStreetIndicators || parts.length >= 4) {
      // Use structured API
      return {
        endpoint: '/geocode/structured',
        payload: {
          street: parts[0] || '',
          city: parts[1] || '',
          state: parts[2] || '',
          country: parts[3] || ''
        }
      };
    } else if (parts.length === 3) {
      // Format: "City, State, Country" - use search API
      return {
        endpoint: '/geocode/search',
        payload: { q: cleaned, limit: 5 }
      };
    } else if (parts.length === 2) {
      // Format: "City, Country" - use basic geocode API
      return {
        endpoint: '/geocode',
        payload: { q: cleaned, limit: 5 }
      };
    } else {
      // Single location - use basic geocode API
      return {
        endpoint: '/geocode',
        payload: { q: cleaned, limit: 5 }
      };
    }
  }

  // Call geocoding API and get timezone
  async function resolveLocationAndTimezone(placeOfBirth) {
    try {
      // Try cache first (TTL from config)
      const normalized = (placeOfBirth || '').trim().toLowerCase();
      const geoCacheKey = `geocode:${simpleHash(normalized)}`;
      try {
        const rawCached = localStorage.getItem(geoCacheKey);
        if (rawCached) {
          const parsed = JSON.parse(rawCached);
          const ageMs = Date.now() - (parsed.__ts || 0);
          const TTL = 1000 * 60 * 60 * 24 * CACHE_CONFIG.geocodeTtlDays;
          if (ageMs > 0 && ageMs < TTL && parsed.data) {
            return parsed.data;
          }
        }
      } catch (e) {
        // ignore cache errors
      }
      // Determine which geocoding API to use
      const geocodingConfig = determineGeocodingEndpoint(placeOfBirth);
      if (!geocodingConfig) {
        throw new Error('Invalid location format');
      }

      // Call geocoding API (via BFF) with request-id header
      const geocodeResponse = await bffFetchWithRetry(geocodingConfig.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geocodingConfig.payload)
      }, { retries: 3, baseDelayMs: 400 });

      // Capture response headers and body for debugging/correlation
      const geoRespReqId = geocodeResponse && geocodeResponse.headers && geocodeResponse.headers.get
        ? geocodeResponse.headers.get('x-request-id')
        : null;
      const geoRespContentType = geocodeResponse && geocodeResponse.headers && geocodeResponse.headers.get
        ? geocodeResponse.headers.get('content-type') || ''
        : '';

      if (!geocodeResponse.ok) {
        const text = await geocodeResponse.text().catch(() => '');
        console.error('Geocoding request failed', { status: geocodeResponse.status, reqId: geoRespReqId, bodyPreview: text.slice ? text.slice(0, 400) : text });
        try { sendClientLog('geocode.resolve_failed', { status: geocodeResponse.status, reqId: geoRespReqId }); } catch (e) {}
        // Surface a friendly message to the user (avoid duplicate messages)
        {
          const errorText = 'Automatic location detection failed — please enter your place of birth manually.';
          setMessages(prev => {
            // If a recent identical bot message exists (last 3), don't add again
            const recent = prev.slice(-3);
            const dup = recent.some(m => m && m.sender === 'bot' && m.text === errorText);
            if (dup) return prev;
            return [...prev, { id: Date.now(), text: errorText, sender: 'bot', timestamp: new Date() }];
          });
        }
        throw new Error(`Geocoding failed: ${geocodeResponse.status}`);
      }

      // Try to parse JSON but fall back to text if provider returned non-JSON
      let geocodeData = null;
      try {
        if (geoRespContentType && geoRespContentType.includes('application/json')) {
          geocodeData = await geocodeResponse.json();
        } else {
          const txt = await geocodeResponse.text();
          try { geocodeData = JSON.parse(txt); } catch (e) { geocodeData = txt; }
        }
      } catch (e) {
        console.error('Failed to parse geocode response body', e);
        try { sendClientLog('geocode.resolve_parse_error', { message: e && e.message, reqId: geoRespReqId }); } catch (ee) {}
        throw e;
      }

      // Log a short preview for debugging and correlation with BFF logs
      const geoPreview = typeof geocodeData === 'string' ? geocodeData.slice(0, 400) : (geocodeData ? JSON.stringify(geocodeData).slice(0, 400) : '');
      console.log('resolveLocationAndTimezone: geocode response', { status: geocodeResponse.status, reqId: geoRespReqId, contentType: geoRespContentType, bodyPreview: geoPreview });
      try { sendClientLog('geocode.resolve_response', { reqId: geoRespReqId, contentType: geoRespContentType }); } catch (e) {}
      
      // Unwrap BFF response (BFF wraps in {status, data, reqId})
      const actualData = geocodeData.data || geocodeData;

      // Extract location data from geocoding response
      // Accept both `place` (search/reverse responses) and `location` (current-location endpoint)
      let locationData = null;
      if (actualData.status === 'ok' && (actualData.place || actualData.location)) {
        locationData = actualData.place || actualData.location;
      } else if (actualData.status === 'ambiguous' && actualData.suggestions && actualData.suggestions.length > 0) {
        // Use the first suggestion
        locationData = actualData.suggestions[0];
      }

      if (!locationData) {
        console.error('No location data found after geocode. geocodeData:', geocodeData);
        try { sendClientLog('geocode.no_location_found', { geocodeData: (typeof geocodeData === 'string' ? geocodeData.slice(0,400) : (geocodeData ? JSON.stringify(geocodeData).slice(0,400) : null)), reqId: geoRespReqId }); } catch (e) {}
        // Avoid spamming the same suggestion if it's already visible
        {
          const suggestText = 'Could not find a matching place for your input — please refine the place name.';
          setMessages(prev => {
            const recent = prev.slice(-3);
            const dup = recent.some(m => m && m.sender === 'bot' && m.text === suggestText);
            if (dup) return prev;
            return [...prev, { id: Date.now(), text: suggestText, sender: 'bot', timestamp: new Date() }];
          });
        }
        throw new Error('No location data found');
      }

      // Normalize returned location to prefer English-friendly names when possible
      // Use country code mapping to our `countries` list and try to extract ASCII city from display_name
      const normalizeLocation = (loc) => {
        if (!loc || typeof loc !== 'object') return loc;
        const out = { ...loc };
        const countryCode = (loc.countryCode || loc.country_code || (loc.address && (loc.address.country_code || loc.address.countryCode)) || '').toString().toUpperCase();

        // Map country code to English country name if available
        if (countryCode) {
          const mapped = (auth.countries || []).find(c => (c.code || '').toString().toUpperCase() === countryCode);
          if (mapped && mapped.name) out.country = mapped.name;
        }

        // If city contains non-ASCII characters, try to pick an ASCII candidate from display_name
        const hasNonAscii = (str) => /[^\u0000-\u007F]/.test(str || '');
        if (out.city && hasNonAscii(out.city) && out.display_name && typeof out.display_name === 'string') {
          const parts = out.display_name.split(',').map(p => p.trim()).filter(Boolean);
          const asciiCandidate = parts.find(p => /[A-Za-z]/.test(p));
          if (asciiCandidate) out.city = asciiCandidate;
        }

        // Also, if country now equals a non-meaningful value, prefer display_name's last segment mapped via countries
        if ((!out.country || hasNonAscii(out.country)) && out.display_name) {
          const parts = out.display_name.split(',').map(p => p.trim()).filter(Boolean);
          const last = parts[parts.length - 1] || '';
          if (last && /[A-Za-z]/.test(last)) out.country = last;
        }

        return out;
      };

      locationData = normalizeLocation(locationData);

      // Get timezone using astrology geo-details API
      const timezonePayload = {
        lat: locationData.lat,
        lon: locationData.lon
      };

      const timezoneResponse = await bffFetch('/astrology/geo-details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(timezonePayload)
      });

      if (!timezoneResponse.ok) {
        throw new Error(`Timezone lookup failed: ${timezoneResponse.status}`);
      }

      const timezoneData = await timezoneResponse.json();
      let timezone = 0; // Default to UTC
      
      if (timezoneData.status === 'ok' && timezoneData.data) {
        // Extract timezone from the response
        timezone = timezoneData.data.timezone || timezoneData.data.utc_offset || 0;
      }

      // Persist a UI-friendly place string into the canonical profile shape
      try {
        const formattedPlace = formatPlaceFromLocation(locationData) || (locationData.display_name || '');
        const existing = JSON.parse(localStorage.getItem('niyati_user_profile') || '{}');
        const updatedProfile = {
          ...existing,
          user_placeOfBirth: formattedPlace,
          // keep raw provider string for debugging/privacy decisions
          placeOfBirth_raw: locationData.display_name || existing.placeOfBirth_raw || '',
          updatedAt: new Date().toISOString()
        };
        localStorage.setItem('niyati_user_profile', JSON.stringify(updatedProfile));
        // Update in-memory profile for immediate UI reflection
        try { updateProfile({ user_placeOfBirth: formattedPlace, placeOfBirth_raw: locationData.display_name || '' }); } catch (e) {}
      } catch (e) {
        // best-effort, do not block
      }

      // Cache geocode result for future quick lookups
      try {
        const cacheObj = { __ts: Date.now(), data: { location: locationData, timezone } };
        localStorage.setItem(geoCacheKey, JSON.stringify(cacheObj));
      } catch (e) {}

      return {
        location: locationData,
        timezone: timezone
      };
    } catch (error) {
      console.error('Error resolving location and timezone:', error);
      throw error;
    }
  }

  // Call astrology APIs (planets and horoscope SVG)
  async function calculateAstrology(profile, locationData, timezone) {
    try {
      // Deterministic cache key for astrology results (TTL from config)
      const profileKey = JSON.stringify({ name: profile.user_name, dob: profile.user_dob, place: profile.user_placeOfBirth, tob: profile.user_timeOfBirth });
      const astroCacheKey = `astrology:${simpleHash(profileKey)}`;
      try {
        const raw = localStorage.getItem(astroCacheKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          const age = Date.now() - (parsed.__ts || 0);
          const TTL = 1000 * 60 * 60 * 24 * CACHE_CONFIG.astrologyTtlDays;
          if (age > 0 && age < TTL && parsed.results) {
            // Use cached results and avoid provider calls
            sendClientLog('calculateAstrology.cache_hit');
            return parsed.results;
          }
        }
      } catch (e) {
        // ignore cache errors
      }
      // Parse birth date and time
      const [year, month, date] = profile.user_dob.split('-').map(n => parseInt(n, 10));
      const timeParts = (profile.user_timeOfBirth || '00:00:00').split(':').map(n => parseInt(n, 10));
      const [hours, minutes, seconds] = [timeParts[0] || 0, timeParts[1] || 0, timeParts[2] || 0];

      // Prepare astrology payload
      const astrologyPayload = {
        year,
        month,
        date,
        hours,
        minutes,
        seconds,
        latitude: locationData.lat,
        longitude: locationData.lon,
        timezone,
        settings: {
          observation_point: 'topocentric',
          ayanamsha: 'lahiri',
          language: 'en'
        }
      };

      // Sequential pipeline: call planets first, then (on success) call horoscope-svg after a short delay.
      // This keeps work in the background (caller often doesn't await `processCompleteProfile`),
      // and makes it easy to add more follow-up APIs later.
      const results = {};

      try {
        console.log('calculateAstrology: calling /api/astrology/planets');
        sendClientLog('calculateAstrology.planets.call');
          const planetsResponse = await bffFetchWithRetry('/astrology/planets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(astrologyPayload)
        });

        if (planetsResponse.ok) {
          results.planets = await planetsResponse.json();
          console.log('calculateAstrology: /planets success');
          sendClientLog('calculateAstrology.planets.success');

          // Wait a short delay before calling follow-up APIs to avoid provider race/throttling
          await new Promise((r) => setTimeout(r, 1000));

          console.log('calculateAstrology: calling /api/astrology/horoscope-svg');
          try {
            const fullHoroscopeUrl = buildApiUrl('/astrology/horoscope-svg');
            console.log('calculateAstrology: full horoscope URL ->', fullHoroscopeUrl);
            sendClientLog('calculateAstrology.horoscope.call', { url: fullHoroscopeUrl });
          } catch (e) {
            console.debug('calculateAstrology: failed to build horoscope URL', e);
          }
          const horoscopeResponse = await bffFetchWithRetry('/astrology/horoscope-svg', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...astrologyPayload,
              config: astrologyPayload.settings // Some endpoints expect 'config' instead of 'settings'
            })
          });

          // Capture response headers for correlation
          const respReqId = horoscopeResponse && horoscopeResponse.headers && horoscopeResponse.headers.get
            ? horoscopeResponse.headers.get('x-request-id')
            : null;
          const respContentType = horoscopeResponse && horoscopeResponse.headers && horoscopeResponse.headers.get
            ? horoscopeResponse.headers.get('content-type') || ''
            : '';

          let horoscopeBody = null;
          try {
            if (respContentType && respContentType.includes('application/json')) {
              horoscopeBody = await horoscopeResponse.json();
            } else {
              // Try to read as text (covers SVG, plain text, or JSON returned as text)
              const txt = await horoscopeResponse.text();
              try { horoscopeBody = JSON.parse(txt); } catch (e) { horoscopeBody = txt; }
            }
          } catch (e) {
            console.error('calculateAstrology: failed to read horoscope response body', e);
            try { sendClientLog('calculateAstrology.horoscope.read_error', { message: e && e.message }); } catch (ee) {}
          }

          // Small preview for logs
          const preview = typeof horoscopeBody === 'string' ? horoscopeBody.slice(0, 400) : (horoscopeBody ? JSON.stringify(horoscopeBody).slice(0, 400) : '');
          console.log('calculateAstrology: /horoscope-svg response', { status: horoscopeResponse.status, reqId: respReqId, contentType: respContentType, bodyPreview: preview });

          if (horoscopeResponse.ok) {
            results.horoscopeSvg = horoscopeBody;
            console.log('calculateAstrology: /horoscope-svg success');
            sendClientLog('calculateAstrology.horoscope.success', { reqId: respReqId, contentType: respContentType });
          } else {
            console.error('Horoscope SVG API failed:', horoscopeResponse.status);
            sendClientLog('calculateAstrology.horoscope.failed', { status: horoscopeResponse.status, reqId: respReqId });
          }
        } else {
          console.error('Planets API failed:', planetsResponse.status);
          sendClientLog('calculateAstrology.planets.failed', { status: planetsResponse.status });
        }
      } catch (err) {
        console.error('calculateAstrology: error during astrology calls', err);
        try { sendClientLog('calculateAstrology.error', { message: err && err.message }); } catch (e) {}
      }

      // Persist deterministic cache for astrology results
      try {
        const cacheObj = { __ts: Date.now(), results };
        localStorage.setItem(astroCacheKey, JSON.stringify(cacheObj));
      } catch (e) {}

      return results;
    } catch (error) {
      console.error('Error calculating astrology:', error);
      throw error;
    }
  }

  // Main function to process complete profile and generate astrology
  async function processCompleteProfile(profile) {
    try {
      console.log('Processing complete profile for astrology calculations...');
      
      // Step 1: Resolve location and get timezone
      const { location, timezone } = await resolveLocationAndTimezone(profile.user_placeOfBirth);
      
      console.log('Location resolved:', location);
      console.log('Timezone:', timezone);
      
      // Step 2: Calculate astrology
      const astrologyResults = await calculateAstrology(profile, location, timezone);
      
      console.log('Astrology calculations complete:', astrologyResults);
      
      // Store the results in localStorage for later use
      const cacheKey = `astrology_${auth.phoneNumber}_${Date.now()}`;
      try {
        localStorage.setItem(cacheKey, JSON.stringify({
          profile,
          location,
          timezone,
          results: astrologyResults,
          calculatedAt: new Date().toISOString()
        }));
        console.log('Astrology results cached:', cacheKey);
      } catch (e) {
        console.warn('Failed to cache astrology results:', e);
      }
      
      return astrologyResults;
    } catch (error) {
      console.error('Failed to process complete profile:', error);
      // Don't throw - let the app continue functioning
    }
  }
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
            getUserCountry={getUserCountry}
            formatDobForDisplay={formatDobForDisplay}
            formatTimeForDisplay={formatTimeForDisplay}
            getDisplayPlace={getDisplayPlace}
            onReset={handleReset}
          />

          {/* Messages Area */}
          <MessageList
            messages={messages}
            isLoading={isLoading}
            messagesEndRef={messagesEndRef}
          />

          {/* Input Area */}
          <ChatInput
            value={inputText}
            onChange={setInputText}
            onSubmit={handleSend}
            isLoading={isLoading}
            placeholder="Ask something..."
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