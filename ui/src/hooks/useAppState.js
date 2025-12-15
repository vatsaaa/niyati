import { useState, useEffect } from 'react';

const DEFAULT_COUNTRIES = [
  { code: 'US', name: 'United States', dialCode: '+1', flag: '🇺🇸', phoneLength: 10, phoneRegex: '^\\d{10}$' },
  { code: 'IN', name: 'India', dialCode: '+91', flag: '🇮🇳', phoneLength: 10, phoneRegex: '^\\d{10}$' },
  { code: 'UK', name: 'United Kingdom', dialCode: '+44', flag: '🇬🇧', phoneLength: 10, phoneRegex: '^\\d{10}$' }
];

// Helper: load user profile from storage
function loadUserProfileFromStorage() {
  try {
    const savedNew = localStorage.getItem('niyati_user_profile');
    if (savedNew) return JSON.parse(savedNew);
    
    // Default canonical shape
    return { 
      user_name: '', 
      user_dob: '', 
      user_placeOfBirth: '', 
      user_timeOfBirth: '', 
      user_currentLocation: '', 
      user_verified: {}, 
      user_consentGiven: false,
      user_isPaid: false
    };
  } catch (e) {
    return { 
      user_name: '', 
      user_dob: '', 
      user_placeOfBirth: '', 
      user_currentLocation: '', 
      user_verified: {}, 
      user_consentGiven: false 
    };
  }
}

export const useProfile = () => {
  const [profile, setProfile] = useState(() => loadUserProfileFromStorage());
  
  const updateProfile = (updates) => {
    setProfile(prev => {
      const updated = { ...prev, ...updates };
      localStorage.setItem('niyati_user_profile', JSON.stringify(updated));
      return updated;
    });
  };

  const resetProfile = () => {
    const emptyProfile = { 
      user_name: '', 
      user_dob: '', 
      user_placeOfBirth: '', 
      user_timeOfBirth: '',
      user_currentLocation: '', 
      user_verified: {}, 
      user_consentGiven: false,
      user_isPaid: false
    };
    setProfile(emptyProfile);
    localStorage.setItem('niyati_user_profile', JSON.stringify(emptyProfile));
  };

  return { profile, updateProfile, resetProfile };
};

export const useAuth = () => {
  const [phoneNumber, setPhoneNumber] = useState(() => {
    return localStorage.getItem('niyati_user_phone_number') || '';
  });
  
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    return !!localStorage.getItem('niyati_user_phone_number');
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
      const savedCode = localStorage.getItem('niyati_user_country_code');
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

  const login = (phone, country) => {
    const formattedPhone = `${country.dialCode}-${phone}`;
    setPhoneNumber(formattedPhone);
    setIsLoggedIn(true);
    localStorage.setItem('niyati_user_phone_number', formattedPhone);
    localStorage.setItem('niyati_user_country_code', country.code);
  };

  const logout = () => {
    setPhoneNumber('');
    setIsLoggedIn(false);
    localStorage.removeItem('niyati_user_phone_number');
    localStorage.removeItem('niyati_user_country_code');
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
    const isReturning = !!localStorage.getItem('niyati_user_phone_number') || !!localStorage.getItem('niyati_user_profile');
    if (isReturning) return [];

    // Default welcome message for first-time visitors
    return [{
      id: 1,
      text: "Hello! I am Niyati. What is on your mind today?",
      sender: 'bot',
      timestamp: new Date()
    }];
  });

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
    return newMessage;
  };

  const clearMessages = () => {
    const isReturning = !!localStorage.getItem('niyati_user_phone_number') || !!localStorage.getItem('niyati_user_profile');
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
