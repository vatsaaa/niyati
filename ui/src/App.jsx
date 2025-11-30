import React, { useState, useEffect, useRef } from 'react';
import { Send, Sparkles, Moon, Star, Trash2, Phone, ChevronDown } from 'lucide-react';

// --- CONFIGURATION ---
const N8N_WEBHOOK_URL = "https://nonexperientially-nonascetical-agnes.ngrok-free.dev/webhook/chat";
const BFF_BASE_URL = window.location.hostname === 'localhost' ? 'http://localhost:3000' : '';

// Default fallback countries (used until /countries.json is fetched)
const DEFAULT_COUNTRIES = [
  { code: 'US', name: 'United States', dialCode: '+1', flag: '🇺🇸', phoneLength: 10, phoneRegex: '^\\d{10}$' },
  { code: 'IN', name: 'India', dialCode: '+91', flag: '🇮🇳', phoneLength: 10, phoneRegex: '^\\d{10}$' },
  { code: 'UK', name: 'United Kingdom', dialCode: '+44', flag: '🇬🇧', phoneLength: 10, phoneRegex: '^\\d{10}$' }
];

const NiyatiChat = () => {
  // 1. STATE MANAGEMENT
  // We store the phone number instead of a random session ID
  // Use canonical keys: `niyati_user_phone_number`.
  const [phoneNumber, setPhoneNumber] = useState(() => {
    return localStorage.getItem('niyati_user_phone_number') || '';
  });

  // Only show chat if we have a phone number (check both new and legacy keys)
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    return !!localStorage.getItem('niyati_user_phone_number');
  });

  const [tempPhone, setTempPhone] = useState('');
  const [countries, setCountries] = useState(() => {
    try {
      const saved = localStorage.getItem('niyati_countries');
      return saved ? JSON.parse(saved) : DEFAULT_COUNTRIES;
    } catch (e) {
      return DEFAULT_COUNTRIES;
    }
  });

  // initialize selected country from localStorage or fallback
  const [selectedCountry, setSelectedCountry] = useState(() => {
    try {
      const savedCode = localStorage.getItem('niyati_user_country_code');
      if (savedCode) {
        const found = (JSON.parse(localStorage.getItem('niyati_countries')) || DEFAULT_COUNTRIES).find(c => c.code === savedCode);
        if (found) return found;
      }
    } catch (e) {}
    return DEFAULT_COUNTRIES[0];
  });
  const [showDropdown, setShowDropdown] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');
  const dropdownRef = useRef(null);

  // 2. MESSAGE HISTORY
  const [messages, setMessages] = useState(() => {
    const savedMessages = localStorage.getItem('niyati_chat_history');
    if (savedMessages) {
      try {
        const parsed = JSON.parse(savedMessages);
        return parsed.map(msg => ({ ...msg, timestamp: new Date(msg.timestamp) }));
      } catch (e) {
        console.error("Failed to parse history", e);
      }
    }
    // Default welcome message
    return [{
      id: 1,
      text: "Hello! I am Niyati. I see you have returned. What is on your mind today?",
      sender: 'bot',
      timestamp: new Date()
    }];
  });

  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  // Helper: load user profile from storage with migration from legacy keys
  function loadUserProfileFromStorage() {
    try {
      const savedNew = localStorage.getItem('niyati_user_profile');
      if (savedNew) return JSON.parse(savedNew);

      // No legacy fallback: only read canonical `niyati_user_profile`

      // Default canonical shape
      return { user_name: '', user_dob: '', user_placeOfBirth: '', user_timeOfBirth: '', user_currentLocation: '', user_verified: {}, user_consentGiven: false };
    } catch (e) {
      return { user_name: '', user_dob: '', user_placeOfBirth: '', user_currentLocation: '', user_verified: {}, user_consentGiven: false };
    }
  }

  // Profile state: canonical shape stored under `niyati_user_profile`
  const [profile, setProfile] = useState(() => loadUserProfileFromStorage());
  const [consentChecked, setConsentChecked] = useState(() => {
    try {
      const p = loadUserProfileFromStorage();
      return !!p.user_consentGiven;
    } catch (e) { return false; }
  });

  // Privacy modal state (load markdown renderer at runtime from CDN to avoid bundler errors)
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [privacyHtml, setPrivacyHtml] = useState('');
  const [privacyLoading, setPrivacyLoading] = useState(false);
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
    if (isLoggedIn) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      localStorage.setItem('niyati_chat_history', JSON.stringify(messages));
    }
  }, [messages, isLoggedIn]);

  // Persist canonical profile whenever it changes
  useEffect(() => {
    try { localStorage.setItem('niyati_user_profile', JSON.stringify(profile)); } catch (e) {}
  }, [profile]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
        setCountrySearch('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch countries.json at runtime and update list (cached in localStorage)
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/countries.json');
        if (!res.ok) return;
        const data = await res.json();
        if (!data || !Array.isArray(data.countries)) return;
        const mapped = data.countries.map(c => ({ ...c, flag: c.flagEmoji || c.flag || '' }));
        if (cancelled) return;
        setCountries(mapped);
        try { localStorage.setItem('niyati_countries', JSON.stringify(mapped)); } catch (e) {}
        // If user has previously selected a country code, update the selectedCountry reference
        const savedCode = localStorage.getItem('niyati_user_country_code');
        if (savedCode) {
          const found = mapped.find(m => m.code === savedCode);
          if (found) setSelectedCountry(found);
        }
      } catch (e) {
        // fail silently and use fallback
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  // Filter countries based on search
  const filteredCountries = countries.filter(country => 
    country.name.toLowerCase().includes(countrySearch.toLowerCase()) ||
    country.code.toLowerCase().includes(countrySearch.toLowerCase())
  );

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

  // bffFetch: prefixes BFF_BASE_URL when needed and adds an `x-request-id` header (session-level)
  async function bffFetch(pathOrUrl, options = {}) {
    const url = (typeof pathOrUrl === 'string' && (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')))
      ? pathOrUrl
      : `${BFF_BASE_URL}${pathOrUrl}`;

    const reqId = getSessionReqId();

    const headers = new Headers(options.headers || {});
    headers.set('x-request-id', reqId);

    const merged = { ...options, headers };
    return fetch(url, merged);
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
      await bffFetch('/api/telemetry/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag, meta: safe, ts: Date.now() })
      });
    } catch (e) {
      // best-effort, do not surface to user
    }
  }
  const handleLogin = async (e) => {
    e.preventDefault();
    const requiredLen = selectedCountry?.phoneLength || 10;
    if (!tempPhone.trim() || tempPhone.length !== requiredLen) {
      alert(`Please enter a valid ${requiredLen}-digit phone number`);
      return;
    }
    if (!consentChecked) {
      alert('Please review and accept the Privacy Policy to continue.');
      return;
    }
    // Combine country code with phone number (format: +1-5551234567)
    const fullPhone = `${selectedCountry.dialCode}-${tempPhone.trim()}`;
    
    // Persist phone and country under canonical keys. Legacy writes removed (Phase A).
    try { localStorage.setItem('niyati_user_phone_number', fullPhone); } catch (e) {}
    try { localStorage.setItem('niyati_user_country_code', selectedCountry.code); } catch (e) {}

    // Generate a fresh session-level request id for this login session
    try { localStorage.setItem('niyati_x_request_id', createUUIDv4()); } catch (e) {}

    // Get current location and persist along with consent
    let currentLocationData = null;
    try {
      // Call the current location API (BFF) with request-id header
      const locationResponse = await bffFetch('/api/geocode/current-location');
      if (locationResponse.ok) {
        const locationData = await locationResponse.json();
        if (locationData.status === 'ok' && locationData.location) {
          // Store only the location object as specified
          currentLocationData = locationData.location;
        }
      }
    } catch (e) {
      console.warn('Failed to fetch current location:', e);
      // Continue with login even if location fetch fails
    }

    // Persist consent and current location in canonical profile shape
    try {
      const existing = JSON.parse(localStorage.getItem('niyati_user_profile') || '{}');
      const updatedProfile = { 
        ...existing, 
        user_consentGiven: true,
        user_currentLocation: currentLocationData || existing.user_currentLocation || '',
        updatedAt: new Date().toISOString() 
      };
      localStorage.setItem('niyati_user_profile', JSON.stringify(updatedProfile));
      setProfile(prev => ({ 
        ...prev, 
        user_consentGiven: true,
        user_currentLocation: currentLocationData || prev.user_currentLocation 
      }));
      
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
    setPhoneNumber(fullPhone);
    setIsLoggedIn(true);
  };

  // Get country data for logged-in user
  const getUserCountry = () => {
    const savedCountryCode = localStorage.getItem('niyati_user_country_code') || 'US';
    return countries.find(c => c.code === savedCountryCode) || countries[0] || DEFAULT_COUNTRIES[0];
  };

  // 4. LOGOUT / RESET HANDLER
  const handleReset = () => {
    if (window.confirm("This will clear your chat history on this device and log you out. Continue?")) {
      localStorage.removeItem('niyati_chat_history');
      // remove both canonical and legacy keys
      // Remove only canonical keys. Legacy keys are no longer written by the app.
      localStorage.removeItem('niyati_user_phone_number');
      localStorage.removeItem('niyati_user_country_code');
      localStorage.removeItem('niyati_user_profile');
      // Clear session request id
      try { localStorage.removeItem('niyati_x_request_id'); } catch (e) {}
      // Reset in-memory state as well
      setIsLoggedIn(false);
      setPhoneNumber('');
      setTempPhone('');
      setConsentChecked(false);
      // reset profile state to canonical empty shape
      setProfile({ user_name: '', user_dob: '', user_placeOfBirth: '', user_currentLocation: '', user_verified: {}, user_consentGiven: false });
      setMessages([]);
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
    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setIsLoading(true);

    // --- Chat-extraction (silent) ---
    // Run extraction heuristics on the user's message and silently persist values for later review.
    const extracted = extractProfileFields(userMessage.text);
    if (extracted.name || extracted.dob || extracted.placeOfBirth || extracted.timeOfBirth) {
      setProfile(prev => ({
        ...prev,
        user_name: extracted.name || prev.user_name,
        user_dob: extracted.dob ? (normalizeDateString(extracted.dob) || extracted.dob) : prev.user_dob,
        user_placeOfBirth: extracted.placeOfBirth || prev.user_placeOfBirth,
        user_timeOfBirth: extracted.timeOfBirth ? (normalizeTimeString(extracted.timeOfBirth) || extracted.timeOfBirth) : prev.user_timeOfBirth,
        user_verified: {
          ...(prev.user_verified || {}),
          ...(extracted.name ? { name: false } : {}),
          ...(extracted.dob ? { dob: false } : {}),
          ...(extracted.placeOfBirth ? { placeOfBirth: false } : {}),
          ...(extracted.timeOfBirth ? { timeOfBirth: false } : {})
        }
      }));
      
      // Check if profile is now complete and process astrology if so
      const updatedProfile = {
        user_name: extracted.name || profile.user_name,
        user_dob: extracted.dob ? (normalizeDateString(extracted.dob) || extracted.dob) : profile.user_dob,
        user_placeOfBirth: extracted.placeOfBirth || profile.user_placeOfBirth,
        user_timeOfBirth: extracted.timeOfBirth ? (normalizeTimeString(extracted.timeOfBirth) || extracted.timeOfBirth) : profile.user_timeOfBirth,
        user_currentLocation: profile.user_currentLocation,
        user_consentGiven: profile.user_consentGiven
      };
      
      // Process astrology in background if profile is complete
      if (isProfileComplete(updatedProfile)) {
        console.log('Profile is complete, processing astrology...');
        processCompleteProfile(updatedProfile);
      }
      
      // Background: resolve the extracted placeOfBirth to a structured place (geocode)
      if (extracted.placeOfBirth) {
        (async () => {
          try {
            const { location } = await resolveLocationAndTimezone(extracted.placeOfBirth);
            if (location) {
              const formatted = formatPlaceFromLocation(location);
              const existing = JSON.parse(localStorage.getItem('niyati_user_profile') || '{}');
              const updated = {
                ...existing,
                user_placeOfBirth: formatted || extracted.placeOfBirth,
                // keep currentLocation untouched here (it's a separate value)
                updatedAt: new Date().toISOString()
              };
              // Persist canonical profile
              try { localStorage.setItem('niyati_user_profile', JSON.stringify(updated)); } catch (e) {}
              // Update in-memory profile
              setProfile(prev => ({ ...prev, user_placeOfBirth: formatted || extracted.placeOfBirth }));

              // After resolving place, optionally trigger astrology if profile is now complete
              const candidate = {
                ...updated,
                user_consentGiven: updated.user_consentGiven || profile.user_consentGiven,
                user_timeOfBirth: profile.user_timeOfBirth || updated.user_timeOfBirth,
                user_dob: profile.user_dob || updated.user_dob,
                user_name: profile.user_name || updated.user_name
              };
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
      const response = await fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage.text, 
          sessionId: phoneNumber // <--- KEY FIX: Send Phone Number as ID
        }),
      });

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
      setMessages(prev => [...prev, botMessage]);

    } catch (error) {
      console.error("Error:", error);
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        text: "I cannot reach the server. Please check your connection.",
        sender: 'bot',
        isError: true,
        timestamp: new Date()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  // --- Helper: simple profile extraction heuristics ---
  function extractProfileFields(text) {
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

    // Place of birth patterns
    const placeMatch = text.match(/(?:born in|from|i was born in)\s+([A-Za-z0-9 ,.\-']{3,100})/i);
    if (placeMatch) result.placeOfBirth = placeMatch[1].trim();

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

    return result;
  }

  // Normalize time strings to HH:MM (24-hour) when possible
  function normalizeTimeString(s) {
    if (!s || typeof s !== 'string') return '';
    let t = s.trim();
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
  function normalizeDateString(s, countryHint = 'US') {
    if (!s || typeof s !== 'string') return null;
    s = s.trim();
    // YYYY-MM-DD already
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) return s;

    // Try textual parse first (e.g., '12 Jan 1990' or 'Jan 12 1990')
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

    const parts = [cityToUse, state, country].map(p => (p || '').trim()).filter(p => p.length > 0);
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
        endpoint: '/api/geocode/structured',
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
        endpoint: '/api/geocode/search',
        payload: { q: cleaned, limit: 5 }
      };
    } else if (parts.length === 2) {
      // Format: "City, Country" - use basic geocode API
      return {
        endpoint: '/api/geocode',
        payload: { q: cleaned, limit: 5 }
      };
    } else {
      // Single location - use basic geocode API
      return {
        endpoint: '/api/geocode',
        payload: { q: cleaned, limit: 5 }
      };
    }
  }

  // Call geocoding API and get timezone
  async function resolveLocationAndTimezone(placeOfBirth) {
    try {
      // Determine which geocoding API to use
      const geocodingConfig = determineGeocodingEndpoint(placeOfBirth);
      if (!geocodingConfig) {
        throw new Error('Invalid location format');
      }

      // Call geocoding API (via BFF) with request-id header
      const geocodeResponse = await bffFetch(geocodingConfig.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geocodingConfig.payload)
      });

      if (!geocodeResponse.ok) {
        throw new Error(`Geocoding failed: ${geocodeResponse.status}`);
      }

      const geocodeData = await geocodeResponse.json();
      
      // Extract location data from geocoding response
      let locationData = null;
      if (geocodeData.status === 'ok' && geocodeData.place) {
        locationData = geocodeData.place;
      } else if (geocodeData.status === 'ambiguous' && geocodeData.suggestions && geocodeData.suggestions.length > 0) {
        // Use the first suggestion
        locationData = geocodeData.suggestions[0];
      }

      if (!locationData) {
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
          const mapped = (countries || []).find(c => (c.code || '').toString().toUpperCase() === countryCode);
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

      const timezoneResponse = await bffFetch('/api/astrology/geo-details', {
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
        try { setProfile(prev => ({ ...prev, user_placeOfBirth: formattedPlace })); } catch (e) {}
      } catch (e) {
        // best-effort, do not block
      }

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
        const planetsResponse = await bffFetch('/api/astrology/planets', {
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
          sendClientLog('calculateAstrology.horoscope.call');
          const horoscopeResponse = await bffFetch('/api/astrology/horoscope-svg', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...astrologyPayload,
              config: astrologyPayload.settings // Some endpoints expect 'config' instead of 'settings'
            })
          });

          if (horoscopeResponse.ok) {
            results.horoscopeSvg = await horoscopeResponse.json();
            console.log('calculateAstrology: /horoscope-svg success');
            sendClientLog('calculateAstrology.horoscope.success');
          } else {
            console.error('Horoscope SVG API failed:', horoscopeResponse.status);
            sendClientLog('calculateAstrology.horoscope.failed', { status: horoscopeResponse.status });
          }
        } else {
          console.error('Planets API failed:', planetsResponse.status);
          sendClientLog('calculateAstrology.planets.failed', { status: planetsResponse.status });
        }
      } catch (err) {
        console.error('calculateAstrology: error during astrology calls', err);
        try { sendClientLog('calculateAstrology.error', { message: err && err.message }); } catch (e) {}
      }

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
      const cacheKey = `astrology_${phoneNumber}_${Date.now()}`;
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
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute top-10 left-10 text-purple-500/20 animate-pulse"><Moon size={120} /></div>
        <div className="absolute bottom-20 right-20 text-amber-500/20 animate-pulse duration-1000"><Star size={80} /></div>
      </div>

      {!isLoggedIn ? (
        // --- LOGIN SCREEN ---
        <div className="w-full max-w-md bg-slate-900/80 backdrop-blur-md border border-slate-700 rounded-2xl shadow-2xl p-8 z-10 text-center">
          <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-purple-600 to-amber-500 flex items-center justify-center shadow-lg mx-auto mb-6">
            <Sparkles className="text-white w-8 h-8" />
          </div>
          <h1 className="font-serif text-2xl text-slate-100 mb-2">Welcome to Niyati</h1>
          <p className="text-slate-400 mb-6 text-sm">Enter your phone number to reveal what destiny has in store for you.</p>
          
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="flex gap-2">
              {/* Country Selector */}
              <div className="relative" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setShowDropdown(!showDropdown)}
                  className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-3 text-slate-200 focus:outline-none focus:border-purple-500 transition-colors flex items-center gap-2 hover:bg-slate-900"
                >
                  <span className="text-2xl">{selectedCountry.flag}</span>
                  <ChevronDown size={16} className="text-slate-400" />
                </button>
                
                {showDropdown && (
                  <div className="absolute top-full mt-2 left-0 w-64 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden">
                    <input
                      type="text"
                      placeholder="Search country..."
                      value={countrySearch}
                      onChange={(e) => setCountrySearch(e.target.value)}
                      className="w-full bg-slate-950 border-b border-slate-700 px-4 py-2 text-slate-200 focus:outline-none text-sm"
                      autoFocus
                    />
                    <div className="max-h-48 overflow-y-auto">
                      {filteredCountries.map((country) => (
                        <button
                          key={country.code}
                          type="button"
                          onClick={() => {
                            setSelectedCountry(country);
                            setShowDropdown(false);
                            setCountrySearch('');
                          }}
                          className={`w-full px-4 py-3 text-left hover:bg-slate-800 transition-colors flex items-center gap-3 ${
                            selectedCountry.code === country.code ? 'bg-slate-800' : ''
                          }`}
                        >
                          <span className="text-2xl">{country.flag}</span>
                          <div className="flex-1">
                            <div className="text-slate-200 text-sm">{country.name}</div>
                            <div className="text-slate-500 text-xs">{country.dialCode}</div>
                          </div>
                        </button>
                      ))}
                      {filteredCountries.length === 0 && (
                        <div className="px-4 py-3 text-slate-500 text-sm text-center">No countries found</div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Phone Number Input */}
              <div className="relative flex-1">
                <Phone className="absolute left-4 top-3.5 text-slate-500 w-5 h-5" />
                <input 
                  type="tel" 
                  placeholder={selectedCountry ? `${selectedCountry.phoneLength}-digit number` : 'Phone number'} 
                  value={tempPhone}
                  onChange={(e) => {
                    const max = selectedCountry?.phoneLength || 10;
                    const value = e.target.value.replace(/\D/g, '').slice(0, max);
                    setTempPhone(value);
                  }}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-12 pr-4 py-3 text-slate-200 focus:outline-none focus:border-purple-500 transition-colors"
                  maxLength={selectedCountry?.phoneLength || 10}
                />
              </div>
            </div>
            <div className="flex items-start gap-2">
              <label className="flex items-center gap-2 text-xs text-slate-200">
                <input
                  type="checkbox"
                  checked={consentChecked}
                  onChange={(e) => setConsentChecked(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-purple-600 focus:ring-0"
                />
                <span>I agree to the</span>
              </label>
              <div className="text-xs text-slate-200">
                <button type="button" onClick={openPrivacy} className="underline text-inherit p-0">Privacy Policy</button>
                <span className="ml-1">and consent to usage of my data.</span>
              </div>
            </div>
            <button type="submit" disabled={tempPhone.length !== (selectedCountry?.phoneLength || 10) || !consentChecked} className="w-full bg-purple-600 hover:bg-purple-500 text-white font-medium p-3 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              Begin Chat
            </button>
            <p className="text-xs text-slate-300 mt-2 leading-tight" align="left">
              Your data is processed and stored on our machines, and used only to provide personalized astrological insights. We will not sell, rent, or share your personal data with third parties. This service is provided for informational and entertainment purposes only and does not constitute professional advice. You acknowledge and accept that the app's content may be interpretive and that you are solely responsible for any decisions made based on it. By checking the box above and continuing, you consent to processing and storage of your data for the operation of this service.
            </p>
          </form>
        </div>
      ) : (
        // --- CHAT SCREEN ---
        <div className="w-full max-w-md bg-slate-900/80 backdrop-blur-md border border-slate-700 rounded-2xl shadow-2xl flex flex-col h-[85vh] z-10 relative">
          
          {/* Header */}
          <div className="p-4 border-b border-slate-700 flex items-center justify-between bg-slate-900/90 rounded-t-2xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-purple-600 to-amber-500 flex items-center justify-center shadow-lg">
                <Sparkles className="text-white w-5 h-5" />
              </div>
              <div>
                <h1 className="font-serif text-xl text-slate-100">Niyati</h1>
                  <div className="flex items-center gap-2">
                    <div aria-live="polite" className="bg-purple-300/40 text-white px-2 py-2 rounded-md w-94 max-w-full min-w-0 overflow-hidden">
                      <div className="min-w-0 text-[clamp(11px,1.1vw,13px)]">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 items-start">
                          {/* Row 1 */}
                          <div className="flex items-center gap-1.5">
                            <div className="flex-shrink-0 mr-1.5 flex items-center gap-1.5">
                              <span className="text-base">{getUserCountry().flag}</span>
                              <span>{phoneNumber.split('-')[1] || phoneNumber}</span>
                            </div>
                          </div>
                          <div className="min-w-0 truncate ">{profile.user_name || '—'}</div>
                          <div className="min-w-0 truncate">{formatDobForDisplay(profile.user_dob, getUserCountry().code) || '—'}</div>
                          
                          {/* Row 2: place directly under flag/phone (col 1), optional center column left blank, time under DOB (col 3) */}
                          <div title={profile.user_placeOfBirth || profile.placeOfBirth_raw || ''} className="min-w-0 truncate sm:col-span-2">{getDisplayPlace(profile)}</div>
                          <div className="min-w-0 truncate">{formatTimeForDisplay(profile.user_timeOfBirth) || '—'}</div>
                        </div>
                      </div>
                    </div>
                  </div>
              </div>
            </div>
            <button onClick={handleReset} className="text-slate-500 hover:text-red-400 self-start relative right-4 top-1" title="Logout / Reset">
              <Trash2 size={18} />
            </button>
          </div>

          {/* Privacy modal was moved to top-level so it can open from the login screen too */}

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] p-3 rounded-2xl text-sm leading-relaxed shadow-md ${
                    msg.sender === 'user' ? 'bg-purple-600 text-white rounded-br-none' : 
                    msg.isError ? 'bg-red-900/50 text-red-200' : 'bg-slate-800 border border-slate-700 text-slate-200 rounded-bl-none'
                  }`}>
                  {msg.text}
                </div>
              </div>
            ))}
            {isLoading && <div className="text-slate-500 text-xs p-4 animate-pulse">Niyati is consulting the stars...</div>}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-4 bg-slate-900/90 border-t border-slate-700 rounded-b-2xl">
            <form onSubmit={handleSend} className="flex gap-2">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Ask something..."
                className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:border-purple-500"
                disabled={isLoading}
              />
              <button type="submit" disabled={!inputText.trim() || isLoading} className="bg-purple-600 hover:bg-purple-500 text-white p-3 rounded-xl transition-colors disabled:opacity-50">
                <Send size={20} />
              </button>
            </form>
          </div>
        </div>
      )}
      {/* Global Privacy modal (renders sanitized HTML converted from markdown) */}
      {showPrivacyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={closePrivacy} />
          <div className="relative bg-slate-900 text-slate-200 rounded-2xl w-[min(92%,720px)] max-h-[80vh] overflow-auto p-6 z-50">
            <div className="flex justify-between items-start mb-4">
              <h2 className="font-semibold text-lg">Privacy Policy</h2>
              <button onClick={closePrivacy} className="text-slate-400 hover:text-white">Close</button>
            </div>
            {privacyLoading ? (
              <div className="text-sm text-slate-400">Loading...</div>
            ) : (
              <div className="prose prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: privacyHtml }} />
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NiyatiChat;