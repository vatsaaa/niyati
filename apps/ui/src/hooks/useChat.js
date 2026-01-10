import { useState } from 'react';
import { extractProfileFields } from '../utils/profileExtractor';
import { normalizeDateString, normalizeTimeString } from '../utils/normalizers';
import { resolveLocationAndTimezone } from '../services/geo';
import { formatPlaceFromLocation, formatDobForDisplay, formatTimeForDisplay } from '../utils/formatters';
import { bffFetchWithRetry, sendClientLog } from '../services/api';
import { N8N_WEBHOOK_URL, N8N_WEBHOOK_FALLBACK_URL } from '../config';
// BFF chat endpoint (server-side canonicalization + forwarding to n8n)
const BFF_CHAT_ENDPOINT = '/api/v1/chat';
// BFF classify endpoint (server-side query classification for billing)
const BFF_CLASSIFY_ENDPOINT = '/api/v1/chat/classify';
import { getSessionReqId } from '../utils/uuid';
import { hasAllRequiredFields, missingProfileFields } from '../utils/profile';

// Check if initial profile has been sent to n8n for this session
function hasProfileBeenSent() {
  try {
    return localStorage.getItem('niyati_profile_sent') === 'true';
  } catch (e) {
    return false;
  }
}

function markProfileAsSent() {
  try {
    localStorage.setItem('niyati_profile_sent', 'true');
  } catch (e) {
    // ignore
  }
}

// Check if payment QR has already been shown to avoid repeating
function hasPaymentQRBeenShown() {
  try {
    return localStorage.getItem('niyati_payment_qr_shown') === 'true';
  } catch (e) {
    return false;
  }
}

function markPaymentQRAsShown() {
  try {
    localStorage.setItem('niyati_payment_qr_shown', 'true');
  } catch (e) {
    // ignore
  }
}

// UPI validation patterns
const UPI_ID_REGEX = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;
const UPI_TXN_ID_REGEX = /^\d{12}$/;

// Check if message contains payment info (UPI ID and/or transaction ID)
function extractPaymentInfo(text) {
  const result = { upiId: null, txnId: null };
  if (!text) return result;
  
  // Try to find UPI ID
  const words = text.split(/\s+/);
  for (const word of words) {
    const cleanWord = word.replace(/[,;.!?]$/, '');
    if (UPI_ID_REGEX.test(cleanWord)) {
      result.upiId = cleanWord;
    }
    // Check for 12-digit transaction ID
    const digits = cleanWord.replace(/\D/g, '');
    if (digits.length === 12 && UPI_TXN_ID_REGEX.test(digits)) {
      result.txnId = digits;
    }
  }
  return result;
}

// Server-side query classification via BFF
// Returns: { queryType, creditCost, isBillable, config }
async function classifyQuery(message) {
  try {
    const response = await bffFetchWithRetry(BFF_CLASSIFY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    });
    if (response && response.ok) {
      // Prefer JSON body when available
      try {
        const data = await response.json();
        if (data && data.status === 'ok' && data.data) return data.data;
      } catch (e) {
        // fallthrough to handle non-JSON
      }
    }
    // If classify endpoint returns auth error (401), mark as non-billable to prevent charge
    if (response && response.status === 401) {
      console.warn('BFF classification unauthorized (401), marking query as non-billable');
      return {
        queryType: 'horoscope',
        creditCost: 0,
        isBillable: false,
        config: { credits_horoscope_cost: 2, credits_premium_cost: 4 }
      };
    }
  } catch (e) {
    console.warn('Failed to classify query via BFF, using defaults:', e);
  }
  // Fallback defaults if BFF call fails
  return {
    queryType: 'horoscope',
    creditCost: 2,
    isBillable: true,
    config: { credits_horoscope_cost: 2, credits_premium_cost: 4 }
  };
}

// Get credits config from localStorage (set by useLogin)
function getCreditsConfig() {
  try {
    const stored = localStorage.getItem('niyati_credits_config');
    if (stored) return JSON.parse(stored);
  } catch (e) { /* ignore */ }
  return {
    credits_monthly_free: 10,
    credits_horoscope_cost: 2,
    credits_premium_cost: 4,
    credits_low_threshold: 4,
    payment_amount_inr: 500
  };
}

// Message variation functions for natural conversation
function getExhaustedCreditsMessage(credits, needed) {
  const messages = [
    `You have ${credits} credits remaining, but this insight requires ${needed} credits. Add more credits to continue your cosmic journey.`,
    `This question needs ${needed} credits, and you have ${credits}. Consider adding credits to unlock deeper astrological wisdom.`,
    `I'd love to help with this, but you need ${needed} credits (you have ${credits}). Please add credits to continue exploring your destiny.`,
    `Your credits (${credits}) are insufficient for this query (${needed} needed). Add credits to keep unveiling what the stars have in store.`
  ];
  return messages[Math.floor(Math.random() * messages.length)];
}

function getPaymentQRMessage(amount, creditsFromPayment) {
  const messages = [
    `To add more credits, scan the QR code above to pay \u20b9${amount} (adds ${creditsFromPayment} credits). After payment, share your UPI ID and the 12-digit transaction ID.`,
    `Scan the QR code to pay \u20b9${amount} and receive ${creditsFromPayment} credits. Once paid, share your UPI ID (e.g., yourname@upi) and transaction ID for verification.`,
    `Ready to continue? Pay \u20b9${amount} via the QR code above to get ${creditsFromPayment} credits. Then share your UPI ID and 12-digit transaction ID.`
  ];
  return messages[Math.floor(Math.random() * messages.length)];
}

function getLowCreditsWarning(credits) {
  const messages = [
    `⚠️ Your credits are running low (${credits} remaining). Consider adding more credits to ensure uninterrupted service.`,
    `⚠️ Heads up! You have only ${credits} credits left. Add more to keep your cosmic conversations flowing.`,
    `⚠️ Low credits alert: ${credits} remaining. Top up soon to continue exploring your astrological insights.`
  ];
  return messages[Math.floor(Math.random() * messages.length)];
}

// Deduct credits after successful response
// Supports idempotency by passing a requestId which will be sent as `x-idempotency-key`
async function deductCredits(phoneNumber, amount, requestId = null, isClarifying = false) {
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (requestId) headers['x-idempotency-key'] = String(requestId);

    const response = await fetch('/api/v1/users/deduct-credits', {
      method: 'POST',
      headers,
      body: JSON.stringify({ phoneNumber, amount, requestId, isClarification: !!isClarifying })
    });
    if (response.ok) {
      const data = await response.json();
      return data.data?.credits ?? null;
    }
  } catch (e) {
    console.warn('Failed to deduct credits:', e);
  }
  return null;
}

// Check if profile details are locked (already sent to n8n once)
function isProfileLocked() {
  try {
    return localStorage.getItem('niyati_profile_sent') === 'true';
  } catch (e) {
    return false;
  }
}

// Check if user is trying to update profile details via chat
function isProfileUpdateAttempt(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.toLowerCase();
  
  const updatePatterns = [
    /my\s+(name|birth|dob|date\s+of\s+birth)\s+(is|was|should\s+be|changed?\s+to)/i,
    /i\s+was\s+(born|actually\s+born)\s+(on|in|at)/i,
    /change\s+(my|the)\s+(name|dob|birth|date|time|place)/i,
    /update\s+(my|the)\s+(name|dob|birth|details|profile)/i,
    /correct(ion)?\s+(to\s+)?(my|the)?\s*(name|dob|birth|details)/i,
    /wrong\s+(name|dob|birth|date|time|place)/i,
    /actually\s+(my\s+)?(name|i\s+was\s+born)/i
  ];
  
  return updatePatterns.some(pattern => pattern.test(t));
}

// Heuristic to detect when the assistant is asking for missing profile details
function isClarifyingResponse(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.toLowerCase();
  const clarifyingPatterns = [
    /could you tell me/i,
    /could you share/i,
    /please tell/i,
    /please share/i,
    /please provide/i,
    /what(?:'|)s your/i,
    /what is your/i,
    /which city/i,
    /which state/i,
    /time of birth/i,
    /date of birth/i,
    /place of birth/i,
    /were you born/i,
    /could you confirm/i
  ];
  if (clarifyingPatterns.some(p => p.test(t))) return true;
  // If the response contains a question mark and mentions birth-related keywords
  if (t.includes('?') && /(birth|dob|date|time|place|born)/i.test(t)) return true;
  return false;
}

export function useChat(profile, updateProfile, addMessage, auth) {
  const [isLoading, setIsLoading] = useState(false);

  const handleSend = async (inputText, setInputText) => {
    // Enhanced input validation
    if (!inputText || typeof inputText !== 'string') return;
    
    const trimmedInput = inputText.trim();
    if (!trimmedInput) return;
    
    // Prevent excessively long messages (XSS/DoS protection)
    if (trimmedInput.length > 2000) {
      addMessage({
        id: Date.now() + Math.random(),
        text: 'Your message is too long. Please keep it under 2000 characters.',
        sender: 'bot',
        timestamp: new Date()
      });
      return;
    }
    
    // Basic XSS protection - strip HTML tags
    const sanitizedInput = trimmedInput.replace(/<[^>]*>/g, '');
    
    const userMessage = {
      id: Date.now(),
      text: sanitizedInput,
      sender: 'user',
      timestamp: new Date(),
    };
    addMessage(userMessage);
    setInputText('');
    setIsLoading(true);

    let currentProfile = { ...profile };
    
    // Check if user is trying to update locked profile details
    if (isProfileLocked() && isProfileUpdateAttempt(inputText)) {
      addMessage({
        id: Date.now() + Math.random(),
        text: "I appreciate you wanting to update your details! To edit any profile information, simply double-click on the specific detail you'd like to change in the profile section above. This ensures your birth chart remains accurate for personalized predictions.",
        sender: 'bot',
        timestamp: new Date()
      });
      setIsLoading(false);
      return;
    }

    // Only extract and update profile fields if profile hasn't been sent yet
    const profileAlreadyLocked = isProfileLocked();
    
    if (!profileAlreadyLocked) {
      try {
        const extracted = await extractProfileFields(userMessage.text);

        if (extracted.name || extracted.dob || extracted.placeOfBirth || extracted.timeOfBirth) {
          const updated = {
            ...currentProfile, // Preserve all existing fields including credits
            name: extracted.name || currentProfile.name,
            birthDate: extracted.dob ? normalizeDateString(extracted.dob) || extracted.dob : currentProfile.birthDate,
            placeOfBirth: extracted.placeOfBirth || currentProfile.placeOfBirth,
            timeOfBirth: extracted.timeOfBirth
              ? normalizeTimeString(extracted.timeOfBirth) || extracted.timeOfBirth
              : currentProfile.timeOfBirth,
            currentLocation: currentProfile.currentLocation,
            consentGiven: currentProfile.consentGiven,
            user_verified: {
              ...(currentProfile.user_verified || {}),
              ...(extracted.name ? { name: false } : {}),
              ...(extracted.dob ? { dob: false } : {}),
              ...(extracted.placeOfBirth ? { placeOfBirth: false } : {}),
              ...(extracted.timeOfBirth ? { timeOfBirth: false } : {}),
            },
          };
          updateProfile(updated);
          currentProfile = updated;

        if (extracted.placeOfBirth) {
          try {
            const { location } = await resolveLocationAndTimezone(extracted.placeOfBirth, auth.countries);
            if (location) {
              const formatted = formatPlaceFromLocation(location);
              const locationUpdate = {
                  placeOfBirth: formatted || extracted.placeOfBirth,
                  placeOfBirth_raw: location.display_name || ''
              };
              updateProfile(locationUpdate);
              currentProfile = { ...currentProfile, ...locationUpdate }; // Ensure local copy is also updated
            }
          } catch (err) {
            console.warn('Place resolution failed:', err?.message || err);
            addMessage({
              id: Date.now(),
              text: 'Automatic location detection failed — please enter your place of birth manually.',
              sender: 'bot',
              timestamp: new Date(),
            });
          }
        }
      }
    } catch (extractError) {
      console.error('Error extracting profile fields:', extractError?.message || extractError);
      // Continue with chat even if profile extraction fails
    }
    } // Close profileAlreadyLocked check

    const getUserCountry = () => {
      const savedCountryCode = localStorage.getItem('niyati_country_code') || 'US';
      return auth.countries.find(c => c.code === savedCountryCode) || auth.countries[0] || { code: 'US', name: 'United States', dialCode: '+1', flag: '🇺🇸', phoneLength: 10 };
    };

    function constructFullMessage(p) {
        const parts = [];
        if (p.name) parts.push(`I am ${p.name}`);
        if (p.birthDate) {
          const userCountry = getUserCountry();
          const formattedDob = formatDobForDisplay(p.birthDate, userCountry.code);
          parts.push(`born on ${formattedDob || p.birthDate}`);
        }
        if (p.timeOfBirth) parts.push(`at ${p.timeOfBirth}`);
        if (p.placeOfBirth) parts.push(`in ${p.placeOfBirth}`);
        return parts.join(', ');
    }

    const callWebhook = async (webhookUrl, reqId, message, userProfile = null) => {
        // Input validation
        if (!webhookUrl || typeof webhookUrl !== 'string') {
          throw new Error('Invalid webhook URL');
        }
        // Allow both absolute URLs (http/https) and relative URLs (starting with /)
        if (!webhookUrl.startsWith('http://') && !webhookUrl.startsWith('https://') && !webhookUrl.startsWith('/')) {
          throw new Error('Webhook URL must be HTTP, HTTPS, or a relative path');
        }
        if (!message || typeof message !== 'string') {
          throw new Error('Invalid message');
        }
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000);

        // Build metadata with structured user object for n8n (metadata-first)
        // Prefer the passed `userProfile`, but fall back to persisted profile in localStorage
        let persistedProfile = null;
        try {
          const stored = localStorage.getItem('niyati_profile');
          if (stored) persistedProfile = JSON.parse(stored);
        } catch (e) {
          // ignore parse errors
        }
        const up = userProfile || persistedProfile || {};

        const metadata = {
          reqId: reqId || 'unknown',
          user: {
            id: up.user_id || up.userId || null,
            name: up.user_name || up.name || null,
            phoneNumber: up.user_phoneNumber || up.phoneNumber || auth?.phoneNumber || null,
            birthDate: up.user_dob || up.dateOfBirth || null,
            timeOfBirth: up.user_timeOfBirth || up.timeOfBirth || null,
            placeOfBirth: up.user_placeOfBirth || up.placeOfBirth || null,
            currentLocation: up.user_currentLocation || up.currentLocation || null,
            age: up.user_age ?? up.age ?? null,
            isAdult: typeof up.user_isAdult === 'boolean' ? up.user_isAdult : (typeof up.isAdult === 'boolean' ? up.isAdult : null),
            credits: up.user_credits ?? up.credits ?? null,
            isPaid: (up.user_totalPaidAmount ?? up.totalPaidAmount ?? 0) > 0,
            preferences: up.user_preferences || up.preferences || null,
            locale: up.user_locale || up.locale || null,
            timezone: up.user_timezone || up.timezone || null,
            location: up.user_location || up.location || null
          },
          source: 'ui'
        };

        try {
          // Log outgoing user message to webhook
          try { console.log('USER', message.substring(0, 500)); } catch (e) { /* ignore logging errors */ }
          const response = await fetch(webhookUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-request-id': reqId || 'unknown',
                    'ngrok-skip-browser-warning': 'true'
                },
                body: JSON.stringify({
                    message: message,
                    sessionId: auth.phoneNumber || 'unknown',
                    metadata: metadata
                }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            return response;
        } catch (err) {
            clearTimeout(timeoutId);
            if (err.name === 'AbortError') {
              throw new Error('Webhook request timeout after 60 seconds');
            }
            throw err;
        }
    };

    try {
      const isReturning = currentProfile.user_verified && (currentProfile.user_verified.id || currentProfile.user_verified.phoneNumber);
      const userCredits = currentProfile.credits ?? 10;
      const totalPaidAmount = currentProfile.totalPaidAmount ?? 0;
      const isPaidUser = totalPaidAmount > 0;
      const qrAlreadyShown = hasPaymentQRBeenShown();
      
      // Get classification from BFF (server-side)
      const classification = await classifyQuery(inputText);
      const { queryType, creditCost: queryCost, isBillable } = classification;
      const config = { ...getCreditsConfig(), ...classification.config };
      const creditsFromPayment = Math.floor(config.payment_amount_inr / 10);
      
      // IMPORTANT: Check if this is casual conversation FIRST
      // Casual messages should pass through to n8n without credit checks
      const isCasualMessage = !isBillable;
      console.log('[useChat] Message classification (from BFF):', { text: inputText.substring(0, 50), queryType, queryCost, isBillable });
      
      // Check if user has enough credits (ONLY for non-casual messages)
      if (!isCasualMessage && userCredits < queryCost && hasAllRequiredFields(currentProfile)) {
        addMessage({
          id: Date.now() + Math.random(),
          text: getExhaustedCreditsMessage(userCredits, queryCost),
          sender: 'bot',
          timestamp: new Date()
        });
        // Show payment QR if not shown
        if (!qrAlreadyShown) {
          addMessage({
            id: Date.now() + Math.random() + 1,
            image: '/payment/PayQR.jpeg',
            text: getPaymentQRMessage(config.payment_amount_inr, creditsFromPayment),
            sender: 'bot',
            timestamp: new Date()
          });
          markPaymentQRAsShown();
        }
        setIsLoading(false);
        return;
      }
      
      // Check if credits are running low for non-paid users (show warning with QR)
      // Skip this check for casual messages
      if (!isCasualMessage && !isPaidUser && userCredits <= config.credits_low_threshold && !qrAlreadyShown && hasAllRequiredFields(currentProfile)) {
        addMessage({
          id: Date.now() + Math.random(),
          text: getLowCreditsWarning(userCredits),
          sender: 'bot',
          timestamp: new Date()
        });
        addMessage({
          id: Date.now() + Math.random() + 1,
          image: '/payment/PayQR.jpeg',
          text: getPaymentQRMessage(config.payment_amount_inr, creditsFromPayment),
          sender: 'bot',
          timestamp: new Date()
        });
        markPaymentQRAsShown();
      }
      
      // Check if user is submitting payment info
      const paymentInfo = extractPaymentInfo(inputText);
      if (paymentInfo.upiId || paymentInfo.txnId) {
        // User is providing payment details
        if (paymentInfo.upiId && paymentInfo.txnId) {
          // Both UPI ID and transaction ID provided - mark as pending verification
          addMessage({
            id: Date.now() + Math.random(),
            text: `Thank you! We received your payment details:\n• UPI ID: ${paymentInfo.upiId}\n• Transaction ID: ${paymentInfo.txnId}\n\nWe'll verify your payment shortly. Once confirmed, you'll have full access to all premium features.`,
            sender: 'bot',
            timestamp: new Date()
          });
          // Save payment info to profile (for backend verification later)
          updateProfile({ 
            user_pendingPayment: { upiId: paymentInfo.upiId, txnId: paymentInfo.txnId, submittedAt: new Date().toISOString() }
          });
          setIsLoading(false);
          return;
        } else if (paymentInfo.upiId && !paymentInfo.txnId) {
          addMessage({
            id: Date.now() + Math.random(),
            text: `I received your UPI ID (${paymentInfo.upiId}). Please also share the 12-digit UPI transaction ID from your payment confirmation.`,
            sender: 'bot',
            timestamp: new Date()
          });
          setIsLoading(false);
          return;
        } else if (!paymentInfo.upiId && paymentInfo.txnId) {
          addMessage({
            id: Date.now() + Math.random(),
            text: `I received a transaction ID (${paymentInfo.txnId}). Please also share the UPI ID you used to make the payment (e.g., yourname@upi).`,
            sender: 'bot',
            timestamp: new Date()
          });
          setIsLoading(false);
          return;
        }
      }
      
      // For free users (no payment history), restrict premium astrology queries only
      // Casual conversation and horoscope queries are allowed through to n8n
      if (!isPaidUser && hasAllRequiredFields(currentProfile)) {
        if (queryType === 'premium') {
          addMessage({
            id: Date.now() + Math.random(),
            image: '/payment/PayQR.jpeg',
            text: `I'd love to help you with detailed birth chart analysis and personalized predictions!\n\nHowever, as a free user with ${userCredits} credits, you can only access today's horoscope (${config.credits_horoscope_cost} credits). Premium questions cost ${config.credits_premium_cost} credits.\n\nTo unlock all premium features, scan the QR code above to pay \u20b9${config.payment_amount_inr} (adds ${creditsFromPayment} credits) and share your UPI ID and 12-digit transaction ID.`,
            sender: 'bot',
            timestamp: new Date()
          });
          markPaymentQRAsShown();
          setIsLoading(false);
          return;
        }
        // Allow horoscope queries and casual conversation to proceed to n8n
      }

      if (!hasAllRequiredFields(currentProfile) && !isReturning) {
        const missing = missingProfileFields(currentProfile);

        if (missing.length > 0) {
          const userName = currentProfile.name ? currentProfile.name.split(' ')[0] : '';
          const greeting = userName ? `Hi ${userName}, ` : '';

          const fieldPhrases = {
            'name': 'your full name',
            'date of birth': 'your date of birth',
            'place of birth': 'which city and state you were born in',
            'time of birth': 'your time of birth'
          };

          const missingPhrases = missing.map(m => fieldPhrases[m] || m);
          let question = '';

          if (missingPhrases.length === 1) {
            question = `Could you tell me ${missingPhrases[0]}?`;
          } else if (missingPhrases.length === 2) {
            question = `Could you tell me ${missingPhrases[0]} and ${missingPhrases[1]}?`;
          } else {
            const last = missingPhrases.pop();
            question = `Could you tell me ${missingPhrases.join(', ')}, and ${last}?`;
          }

          addMessage({ id: Date.now() + Math.random(), text: greeting + question, sender: 'bot', timestamp: new Date() });
        }

        setIsLoading(false);
        return;
      }

      if (!currentProfile.consentGiven) {
        updateProfile({ consentGiven: true });
        currentProfile.consentGiven = true;
      }

        // Only save profile to database if it hasn't been sent yet
        const profileAlreadySent = hasProfileBeenSent();
        if (!profileAlreadySent) {
          // Optimistically mark the profile as sent for this session to avoid
          // races where a second chat message is sent before the POST completes.
          // We still attempt the POST and mark again on failure as a fallback.
          try { markProfileAsSent(); } catch (e) { /* ignore */ }
          try {
            await bffFetchWithRetry('/users/profile', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                phoneNumber: auth.phoneNumber,
                name: currentProfile.name,
                dateOfBirth: currentProfile.birthDate,
                timeOfBirth: currentProfile.timeOfBirth,
                placeOfBirth: currentProfile.placeOfBirth,
                consentGiven: true,
                isPaid: !!currentProfile.isPaid,
                last_login_location: currentProfile.currentLocation || ''
              })
            }, { retries: 2, baseDelayMs: 300 });
            // Mark as sent when the save succeeds (idempotent)
            try { markProfileAsSent(); } catch (e) { /* ignore */ }
          } catch (err) {
            console.warn('Failed to save profile to database:', err);
            // If saving fails due to transient network/backend errors, still mark the
            // profile as sent for this session to avoid duplicate profile posts
            // triggered by subsequent chat messages. This keeps client behavior
            // idempotent in presence of backend problems during e2e runs.
            try { markProfileAsSent(); } catch (e) { /* ignore */ }
          }
        }

      // Determine what message to send to n8n:
      // - First time (profile not sent): send full profile details in message body
      // - Subsequent times: send only the user's message
      // NOTE: Profile is ALWAYS included in metadata so n8n has birth details
      const messageToSend = profileAlreadySent ? inputText : constructFullMessage(currentProfile);
      const webhookReqId = getSessionReqId();
      let response = null;
      let usedFallback = false;

      try {
        // Call n8n webhook directly (per BFF-first architecture: UI → n8n → classify → deduct)
        response = await callWebhook(N8N_WEBHOOK_URL, webhookReqId, messageToSend, currentProfile);
        if (response.status >= 500) {
          throw new Error(`Server error: ${response.status}`);
        }
      } catch (primaryError) {
        console.warn('Primary webhook failed:', primaryError.message);
        if (N8N_WEBHOOK_FALLBACK_URL && N8N_WEBHOOK_FALLBACK_URL !== N8N_WEBHOOK_URL) {
          // fallback still points at n8n directly (rare)
          usedFallback = true;
          response = await callWebhook(N8N_WEBHOOK_FALLBACK_URL, webhookReqId, messageToSend, currentProfile);
        } else {
          throw primaryError;
        }
      }

      sendClientLog('webhook.sent', {
        reqId: webhookReqId,
        status: response && response.status,
        usedFallback
      }, profile);

      let botResponseText = "The stars are clouded... I could not reach the server.";
      let n8nData = null;
      let needsClarificationFlag = false;

      if (response.ok) {
        // Handle empty or non-JSON responses gracefully
        const responseText = await response.text();
        if (!responseText || responseText.trim() === '') {
          botResponseText = "I received your message but didn't get a response. Please ensure n8n workflow is properly configured and active.";
        } else {
          try {
              const data = JSON.parse(responseText);
              // BFF wraps n8n response in data.n8nResponse; fallback to direct output for backward compat
              n8nData = (data && data.data && data.data.n8nResponse) || data;
              // Log N8N response
              try { console.log('N8N', n8nData.output || n8nData.text || JSON.stringify(n8nData)); } catch (e) {}
              botResponseText = n8nData.output || n8nData.text || JSON.stringify(n8nData);

              if (typeof botResponseText === 'string' && botResponseText.startsWith('"') && botResponseText.endsWith('"')) {
                botResponseText = botResponseText.slice(1, -1);
              }

              // Respect explicit needsClarification flag coming from n8n (preferred)
              try {
                needsClarificationFlag = !!(n8nData && (n8nData.needsClarification || (n8nData.ai && n8nData.ai.needsClarification)));
              } catch (err) {
                needsClarificationFlag = false;
              }
              // Fallback heuristic: inspect the assistant text for clarifying questions
              if (!needsClarificationFlag) {
                needsClarificationFlag = isClarifyingResponse(botResponseText);
              }
            } catch (parseError) {
            console.warn('Failed to parse n8n response as JSON:', parseError);
            // Use raw response text if it's not JSON
            botResponseText = responseText;
          }
        }
      }

      addMessage({
        id: Date.now() + 1,
        text: botResponseText,
        sender: 'bot',
        timestamp: new Date()
      });
      
      // Deduct credits after successful response
      // auth.phoneNumber is already formatted as "+91-1234567890"
      const phoneNumber = auth?.phoneNumber || null;
      
      // Re-read profile from localStorage to get latest state (profile might have been updated during the flow)
      let latestProfile = currentProfile;
      try {
        const stored = localStorage.getItem('niyati_profile');
        if (stored) latestProfile = JSON.parse(stored);
      } catch (e) { /* use currentProfile */ }
      
      // Skip credit deduction for casual conversation (greetings, banter, etc.)
      // Also skip deduction if the assistant asked for clarification about profile details
      // isBillable comes from BFF classification done earlier
      const skipCreditDeduction = !isBillable || !!needsClarificationFlag;
      
      console.log('[useChat] Credit deduction check:', { 
        phoneNumber, 
        hasAllFields: hasAllRequiredFields(latestProfile),
        queryCost,
        isCasual: skipCreditDeduction,
        profile: { name: latestProfile.name, dob: latestProfile.birthDate, place: latestProfile.placeOfBirth, time: latestProfile.timeOfBirth }
      });
      
      // Allow deduction for returning users even if some profile fields are missing
      // BUT skip deduction for casual conversation
      const persistedPhone = (() => { try { return localStorage.getItem('niyati_phone_number'); } catch (e) { return null; } })();
      const isReturningNow = (currentProfile.user_verified && (currentProfile.user_verified.id || currentProfile.user_verified.phoneNumber)) || !!persistedPhone;
      if (phoneNumber && (hasAllRequiredFields(latestProfile) || isReturningNow) && !skipCreditDeduction) {
        const newCredits = await deductCredits(phoneNumber, queryCost, webhookReqId, !!needsClarificationFlag);
        console.log('[useChat] Credit deduction result:', { newCredits, previousCredits: latestProfile.credits });
        if (newCredits !== null) {
          updateProfile({ credits: newCredits });
          // Notify user of credit deduction: show low-credit when strictly below threshold
          if (newCredits < config.credits_low_threshold) {
            addMessage({
              id: Date.now() + Math.random(),
              text: `⚠️ Low credits: You have ${newCredits} credits remaining.`,
              sender: 'bot',
              timestamp: new Date()
            });
          }
        }
      } else if (skipCreditDeduction) {
        console.log('[useChat] Skipping credit deduction for casual conversation');
      }

      // For first-time users (not returning) with low credits, show payment QR after n8n response - ONLY ONCE
      const isReturningUser = currentProfile.user_verified && (currentProfile.user_verified.id || currentProfile.user_verified.phoneNumber);
      const currentCredits = currentProfile.credits ?? config.credits_monthly_free;
      if (!isReturningUser && currentCredits < config.credits_low_threshold && !hasPaymentQRBeenShown()) {
        // Single consolidated message with QR
        addMessage({
          id: Date.now() + 2,
          image: '/payment/PayQR.jpeg',
          text: `You have ${currentCredits} credits remaining. To unlock your complete birth chart analysis and premium features, please scan the QR code above to pay \u20b9${config.payment_amount_inr} (adds ${creditsFromPayment} credits). After payment, share your UPI ID (e.g., yourname@upi) and the 12-digit UPI transaction ID for verification.`,
          sender: 'bot',
          timestamp: new Date(),
        });
        markPaymentQRAsShown();
      }

    } catch (error) {
      console.error("Error:", error);
      let errorMessage = "I cannot reach the server. Please check your connection.";
      if (error.name === 'AbortError') {
        errorMessage = "The request took too long to respond. The AI might be processing your message. Please try again in a moment.";
      } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
        errorMessage = "Network error: Unable to connect to the chat service. Please check if n8n is running on localhost:5678.";
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

  return { handleSend, isLoading };
}

// Export helper functions for testing
export { classifyQuery, getCreditsConfig };