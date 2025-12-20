import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, Phone, ChevronDown } from 'lucide-react';

const LoginForm = ({
  onLogin,
  countries,
  selectedCountry,
  setSelectedCountry,
  consentChecked,
  setConsentChecked,
  onShowPrivacy
}) => {
  const [tempPhone, setTempPhone] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');
  const dropdownRef = useRef(null);

  // Filter countries based on search
  const filteredCountries = countries.filter(c =>
    c.name.toLowerCase().includes(countrySearch.toLowerCase()) ||
    c.code.toLowerCase().includes(countrySearch.toLowerCase()) ||
    c.dialCode.includes(countrySearch)
  );

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!tempPhone.trim() || tempPhone.length !== (selectedCountry?.phoneLength || 10)) {
      alert(`Please enter a valid ${selectedCountry?.phoneLength || 10}-digit phone number`);
      return;
    }
    if (!consentChecked) {
      alert('Please accept the Privacy Policy to continue');
      return;
    }
    // Call identify endpoint to check if returning user
    (async () => {
      try {
        const fullPhone = `${selectedCountry.dialCode}-${tempPhone.trim()}`;
        const res = await fetch('/api/v1/users/identify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phoneNumber: fullPhone })
        });
        if (res && res.ok) {
          const payload = await res.json();
          if (payload && payload.status === 'ok' && payload.data && payload.data.returning) {
            // Pass identified user and config back to parent login handler
            return onLogin(tempPhone, selectedCountry, payload.data.user || null, payload.data.config || null);
          }
        }
      } catch (e) {
        // Best-effort: ignore errors and continue login
      }
      return onLogin(tempPhone, selectedCountry, null, null);
    })();
  };

  return (
    <div className="w-full max-w-md bg-slate-900/80 backdrop-blur-md border border-slate-700 rounded-2xl shadow-2xl p-8 z-10 text-center">
      <div className="flex gap-3 justify-center mb-4">
        <button type="button" onClick={() => window.location.href = '/api/v1/auth/google'} className="px-3 py-2 bg-white/5 rounded-lg text-white hover:bg-white/10 transition-colors">Sign in with Google</button>
        <button type="button" onClick={() => window.location.href = '/api/v1/auth/instagram'} className="px-3 py-2 bg-white/5 rounded-lg text-white hover:bg-white/10 transition-colors">Sign in with Instagram</button>
      </div>
      <div className="text-slate-500 text-sm mb-4">or sign in with phone</div>
      <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-purple-600 to-amber-500 flex items-center justify-center shadow-lg mx-auto mb-6">
        <Sparkles className="text-white w-8 h-8" />
      </div>
      <h1 className="font-serif text-2xl text-slate-100 mb-2">Welcome to Niyati</h1>
      <p className="text-slate-400 mb-6 text-sm">Enter your phone number to reveal what destiny has in store for you.</p>

      <form onSubmit={handleSubmit} className="space-y-4">
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
                      className={`w-full px-4 py-3 text-left hover:bg-slate-800 transition-colors flex items-center gap-3 ${selectedCountry.code === country.code ? 'bg-slate-800' : ''
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
            <span className="text-left">
              I consent to sharing my birth information and agree to the{' '}
              <button
                type="button"
                onClick={onShowPrivacy}
                className="text-purple-400 hover:text-purple-300 underline"
              >
                Privacy Policy
              </button>
            </span>
          </label>
        </div>

        <button
          type="submit"
          disabled={!tempPhone.trim() || tempPhone.length !== (selectedCountry?.phoneLength || 10) || !consentChecked}
          className={`w-full py-3 px-6 rounded-xl font-medium shadow-md transition-all duration-200 ${(!tempPhone.trim() || tempPhone.length !== (selectedCountry?.phoneLength || 10) || !consentChecked)
            ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
            : 'bg-gradient-to-r from-purple-600 to-amber-600 hover:from-purple-700 hover:to-amber-700 text-white'
            }`}
        >
          Begin Your Journey
        </button>
      </form>
    </div>
  );
};

export default LoginForm;
