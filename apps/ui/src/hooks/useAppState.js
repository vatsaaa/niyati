import { useState, useEffect } from 'react';

const DEFAULT_COUNTRIES = [
  { code: 'US', name: 'United States', dialCode: '+1', flag: '🇺🇸', phoneLength: 10, phoneRegex: '^\\d{10}$' },
  { code: 'IN', name: 'India', dialCode: '+91', flag: '🇮🇳', phoneLength: 10, phoneRegex: '^\\d{10}$' },
  { code: 'UK', name: 'United Kingdom', dialCode: '+44', flag: '🇬🇧', phoneLength: 10, phoneRegex: '^\\d{10}$' }
];

// Helper: load user profile from storage
function loadUserProfileFromStorage() {
  try {
    const savedNew = localStorage.getItem('niyati_profile');
    if (savedNew) return JSON.parse(savedNew);
    
    // Default canonical shape (new unified keys)
    return { 
      name: '', 
      birthDate: '', 
      placeOfBirth: '', 
      timeOfBirth: '', 
      currentLocation: '', 
      user_verified: {}, 
      consentGiven: false,
      isPaid: false
    };
  } catch (e) {
    return { 
      name: '', 
      birthDate: '', 
      placeOfBirth: '', 
      currentLocation: '', 
      user_verified: {}, 
      consentGiven: false 
    };
  }
}

export const useProfile = () => {
  const [profile, setProfile] = useState(() => loadUserProfileFromStorage());
  
  const updateProfile = (updates) => {
    setProfile(prev => {
      const updated = { ...prev, ...updates };
      localStorage.setItem('niyati_profile', JSON.stringify(updated));
      return updated;
    });
  };

  const resetProfile = () => {
    const emptyProfile = { 
      name: '', 
      birthDate: '', 
      placeOfBirth: '', 
      timeOfBirth: '',
      currentLocation: '', 
      user_verified: {}, 
      consentGiven: false,
      isPaid: false
    };
    setProfile(emptyProfile);
    localStorage.setItem('niyati_profile', JSON.stringify(emptyProfile));
  };

  return { profile, updateProfile, resetProfile };
};

export const useAuth = () => {
  const [phoneNumber, setPhoneNumber] = useState(() => {
    return localStorage.getItem('niyati_phone_number') || '';
  });
  
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    return !!localStorage.getItem('niyati_phone_number');
  });

  const [countries, setCountries] = useState(() => {
    try {
      const saved = localStorage.getItem('niyati_countries');
      return saved ? JSON.parse(saved) : DEFAULT_COUNTRIES;
    } catch (e) {
      return DEFAULT_COUNTRIES;
    }
  });

  const [selectedCountry, setSelectedCountry] = useState(() => {
    try {
      const savedCode = localStorage.getItem('niyati_country_code');
      if (savedCode) {
        const found = (JSON.parse(localStorage.getItem('niyati_countries')) || DEFAULT_COUNTRIES).find(c => c.code === savedCode);
        if (found) return found;
      }
    } catch (e) {}
    return DEFAULT_COUNTRIES[0];
  });

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
        const savedCode = localStorage.getItem('niyati_country_code');
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

  const login = (phone, country) => {
    const formattedPhone = `${country.dialCode}-${phone}`;
    setPhoneNumber(formattedPhone);
    setIsLoggedIn(true);
    localStorage.setItem('niyati_phone_number', formattedPhone);
    localStorage.setItem('niyati_country_code', country.code);
  };

  const logout = () => {
    setPhoneNumber('');
    setIsLoggedIn(false);
    localStorage.removeItem('niyati_phone_number');
    localStorage.removeItem('niyati_country_code');
  };

  const getUserCountry = () => {
    return selectedCountry || DEFAULT_COUNTRIES[0];
  };

  return {
    phoneNumber,
    isLoggedIn,
    countries,
    setCountries,
    selectedCountry,
    setSelectedCountry,
    login,
    logout,
    getUserCountry
  };
};

export const useMessages = () => {
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
    // If user is returning (has phone stored), don't show the generic greeting.
    const isReturning = !!localStorage.getItem('niyati_phone_number') || !!localStorage.getItem('niyati_profile');
    if (isReturning) return [];

    // Default welcome message for first-time visitors
    return [{
      id: 1,
      text: "Hello! I am Niyati. What is on your mind today?",
      sender: 'bot',
      timestamp: new Date()
    }];
  });

  // Load chat history from server on mount (for returning users)
  useEffect(() => {
    let cancelled = false;
    const phoneNumber = localStorage.getItem('niyati_phone_number');
    if (!phoneNumber) return;

    const loadHistory = async () => {
      try {
        const res = await fetch(`/api/v1/chat/history?phoneNumber=${encodeURIComponent(phoneNumber)}`);
        if (!res.ok) return;
        const json = await res.json();
        if (!json || json.status !== 'ok' || !Array.isArray(json.data?.messages)) return;
        if (cancelled) return;

        const serverMsgs = json.data.messages
          .reverse() // API returns DESC, we need ASC
          .map(m => ({
            id: m.message_id,
            text: m.content,
            sender: m.role === 'user' ? 'user' : 'bot',
            timestamp: new Date(m.created_at)
          }));

        if (serverMsgs.length === 0) return;

        // Merge: use server history as base, append any local-only messages
        setMessages(prev => {
          // If local has substantial content, prefer merging; otherwise replace
          if (prev.length <= 1) return serverMsgs;
          // Deduplicate by content+sender within a 2s window
          const seen = new Set(serverMsgs.map(m => `${m.sender}:${m.text?.substring(0, 80)}`));
          const localOnly = prev.filter(m => !seen.has(`${m.sender}:${m.text?.substring(0, 80)}`));
          const merged = [...serverMsgs, ...localOnly];
          localStorage.setItem('niyati_chat_history', JSON.stringify(merged));
          return merged;
        });
      } catch (e) {
        // Fail silently — local history is still available
        console.warn('Failed to load chat history from server:', e);
      }
    };

    loadHistory();
    return () => { cancelled = true; };
  }, []);

  const addMessage = (messageOrText, sender = 'user', isError = false) => {
    let newMessage;
    
    // Handle both object and individual parameters
    if (typeof messageOrText === 'object' && messageOrText !== null) {
      newMessage = {
        ...messageOrText,
        timestamp: messageOrText.timestamp || new Date()
      };
    } else {
      newMessage = {
        id: Date.now(),
        text: messageOrText,
        sender,
        timestamp: new Date(),
        isError
      };
    }
    
    setMessages(prev => {
      const updated = [...prev, newMessage];
      localStorage.setItem('niyati_chat_history', JSON.stringify(updated));
      return updated;
    });
    // Log messages for observability
    try {
      if (newMessage && newMessage.sender === 'bot') {
        console.log('NIYATI', newMessage.text || JSON.stringify(newMessage));
      }
    } catch (e) {
      // ignore logging errors
    }
    return newMessage;
  };

  const clearMessages = () => {
    const isReturning = !!localStorage.getItem('niyati_phone_number') || !!localStorage.getItem('niyati_profile');
    const welcomeMsg = isReturning ? [] : [{
      id: 1,
      text: "Hello! I am Niyati. What is on your mind today?",
      sender: 'bot',
      timestamp: new Date()
    }];
    setMessages(welcomeMsg);
    localStorage.setItem('niyati_chat_history', JSON.stringify(welcomeMsg));
  };

  return { messages, addMessage, clearMessages, setMessages };
};
