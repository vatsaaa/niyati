import { useState } from 'react';
import { extractProfileFields } from '../utils/profileExtractor';
import { normalizeDateString, normalizeTimeString } from '../utils/normalizers';
import { resolveLocationAndTimezone } from '../services/geo';
import { formatPlaceFromLocation, formatDobForDisplay, formatTimeForDisplay } from '../utils/formatters';
import { bffFetchWithRetry, sendClientLog } from '../services/api';
import { N8N_WEBHOOK_URL, N8N_WEBHOOK_FALLBACK_URL } from '../config';
// BFF chat endpoint (server-side canonicalization + forwarding to n8n)
const BFF_CHAT_ENDPOINT = '/api/v1/chat';
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

// Check if user is asking about horoscope (allowed for free users)
function isHoroscopeQuery(text) {
  const horoscopeKeywords = [
    'horoscope', 'today', 'daily', 'zodiac', 'sign', 'aries', 'taurus', 'gemini',
    'cancer', 'leo', 'virgo', 'libra', 'scorpio', 'sagittarius', 'capricorn',
    'aquarius', 'pisces', 'rashifal', 'rashi', 'sun sign', 'moon sign'
  ];
  const lowerText = text.toLowerCase();
  return horoscopeKeywords.some(keyword => lowerText.includes(keyword));
}

// Check if user is asking a premium astrology question (requires payment for free users)
// This excludes casual conversation which should be allowed through to n8n
function isPremiumAstrologyQuery(text) {
  const premiumKeywords = [
    // Birth chart and kundli
    'birth chart', 'kundli', 'kundali', 'natal chart', 'chart analysis',
    // Life areas
    'career', 'job', 'work', 'profession', 'business', 'money', 'wealth', 'finance', 'financial',
    'love', 'relationship', 'marriage', 'partner', 'spouse', 'compatibility', 'soulmate',
    'health', 'medical', 'disease', 'illness',
    'education', 'studies', 'exam', 'results',
    'travel', 'abroad', 'foreign', 'immigration', 'visa',
    'children', 'kids', 'pregnancy', 'fertility',
    'property', 'house', 'real estate', 'land',
    // Predictions and timing
    'predict', 'prediction', 'future', 'forecast', 'when will', 'will i',
    'dasha', 'mahadasha', 'antardasha', 'transit', 'gochar',
    // Remedies
    'remedy', 'remedies', 'solution', 'mantra', 'gemstone', 'stone', 'yantra',
    // Planets and houses
    'saturn', 'shani', 'rahu', 'ketu', 'jupiter', 'guru', 'venus', 'shukra',
    'mars', 'mangal', 'mercury', 'budh', 'moon', 'chandra', 'sun', 'surya',
    'house', 'bhava', 'ascendant', 'lagna'
  ];
  const lowerText = text.toLowerCase();
  return premiumKeywords.some(keyword => lowerText.includes(keyword));
}

// Check if message is casual conversation/banter (should NOT deduct credits)
// This helps distinguish between:
// a) Questions asking for predictions/prophecies -> deduct credits
// b) Casual conversation/greetings/banter -> no credit deduction
// c) Profile information sharing -> no credit deduction (user onboarding)
function isCasualConversation(text) {
  const lowerText = text.toLowerCase().trim();
  
  // Predictive/astrology keywords that indicate a real query (NOT casual)
  // If ANY of these appear, the message is billable, regardless of greeting prefix
  const predictiveWords = [
    'future', 'predict', 'happen', 'luck', 'career', 'love', 'marriage', 'job', 'money',
    'horoscope', 'zodiac', 'kundli', 'kundali', 'chart', 'dasha', 'transit',
    'promotion', 'health', 'wealth', 'children', 'baby', 'travel', 'abroad',
    'forecast', 'prophecy', 'destiny', 'fate', 'rashifal'
  ];
  const hasPredictive = predictiveWords.some(p => lowerText.includes(p));
  if (hasPredictive) return false; // NOT casual — billable

  // Profile information patterns - NEVER billable (user onboarding)
  // Matches: "I am X, born in Y on Z at T", "My name is X", "I was born on", etc.
  const profilePatterns = [
    /\b(i am|i'm|my name is|name is|this is)\b.*\b(born|dob|birth|birthday)\b/i,
    /\bborn\s+(in|on|at)\b/i,  // "born in Delhi", "born on 19 May", "born at 7:31"
    /\b(my|i was)\s+born\b/i,  // "I was born", "my born"
    /\b(date of birth|dob|birthday)\s*(is|:)?\s*\d/i,  // "DOB is 19", "date of birth: 1979"
    /\b(birth\s*place|place of birth|birthplace)\b/i,
    /\b(birth\s*time|time of birth)\b/i,
    /\b\d{1,2}[:\s]?\d{2}\s*(am|pm)\b/i,  // Time patterns like "7:31 am"
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}/i,  // "May 19"
    /\b\d{1,2}\s+(january|february|march|april|may|june|july|august|september|october|november|december)/i,  // "19 May"
    /\b(19|20)\d{2}\b/i,  // Years like 1979, 2001 (birth years)
  ];
  
  // If message contains profile information, it's not billable
  if (profilePatterns.some(pattern => pattern.test(lowerText))) {
    return true;
  }
  
  // Greetings and pleasantries
  const casualPatterns = [
    /^(hi|hello|hey|namaste|good\s*(morning|afternoon|evening|night))\b/i,
    /^(how are you|how're you|how do you do|what's up|wassup|sup)/i,
    /^(thank|thanks|thx)/i,
    /^(bye|goodbye|see you|take care|good night)/i,
    /^(ok|okay|alright|sure|yes|no|yeah|nope|yep)/i,
    /^(nice|great|awesome|cool|wow|amazing|wonderful)/i,
    /\b(how are you|how're you)\??$/i,
    // Memory/identity questions - conversational, not predictions
    /do you (remember|know|recall)/i,  // Matches "do you remember me", "do you remember the time", etc.
    /you remember/i,
    /who am i/i,
    /what('s| is) my name/i,
    /tell me about (myself|me)/i,
    // Small talk about Niyati
    /who are you/i,
    /what('s| is) your name/i,
    /where are you (from|located|based|living)/i,
    /where do you live/i,
    /how old are you/i,
    /are you (real|human|ai|bot)/i,
    // Time-related casual questions
    /what('s| is) the time/i,
    /what time is it/i,
    /what('s| is) the date/i,
    /what day is (it|today)/i,
    // Appreciation and feedback
    /you('re| are) (great|amazing|awesome|wonderful|helpful)/i,
    /i (like|love|enjoy) (talking|chatting) (to|with) you/i,
    /this is (fun|interesting|cool)/i,
    // Simple responses
    /^(really|oh|ah|hmm|haha|lol|ha ha)\??!?$/i,
    /^(i see|got it|understood|makes sense)$/i,
    // General "tell me about today" - casual but may lead to horoscope
    /^(can you )?(tell|talk) (me )?(about )?today\??$/i,
    // Introduction without birth details
    /^(i am|i'm|my name is)\s+[a-z]+$/i,  // Just "I am Ankur" or "My name is Vatsa"
  ];
  
  // Check if message matches casual patterns
  if (casualPatterns.some(pattern => pattern.test(lowerText))) {
    return true;
  }
  
  // Short messages (<=6 words) without predictive keywords are also casual
  // (Note: predictive keywords already checked above, so at this point we know there are none)
  const words = lowerText.split(/\s+/).filter(w => w.length > 0);
  if (words.length <= 6) {
    // Additional patterns for casual statements
    if (lowerText.includes('life has been') || 
        lowerText.includes('i am') || 
        lowerText.includes("i'm") ||
        lowerText.includes('been good') ||
        lowerText.includes('been great') ||
        lowerText.includes('been fine') ||
        lowerText.includes('weather') ||
        lowerText.includes('miss you') ||
        lowerText.includes('missed you')) {
      return true;
    }
  }
  
  return false;
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

// Determine credit cost based on query type (uses configurable values)
function getQueryCreditCost(text) {
  const config = getCreditsConfig();
  if (isHoroscopeQuery(text)) return config.credits_horoscope_cost;
  return config.credits_premium_cost;
}

// Deduct credits after successful response
async function deductCredits(phoneNumber, amount) {
  try {
    const response = await fetch('/api/v1/users/deduct-credits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber, amount })
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
            user_name: extracted.name || currentProfile.user_name,
            user_dob: extracted.dob ? normalizeDateString(extracted.dob) || extracted.dob : currentProfile.user_dob,
            user_placeOfBirth: extracted.placeOfBirth || currentProfile.user_placeOfBirth,
            user_timeOfBirth: extracted.timeOfBirth
              ? normalizeTimeString(extracted.timeOfBirth) || extracted.timeOfBirth
              : currentProfile.user_timeOfBirth,
            user_currentLocation: currentProfile.user_currentLocation,
            user_consentGiven: currentProfile.user_consentGiven,
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
                  user_placeOfBirth: formatted || extracted.placeOfBirth,
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
        const savedCountryCode = localStorage.getItem('niyati_user_country_code') || 'US';
        return auth.countries.find(c => c.code === savedCountryCode) || auth.countries[0] || { code: 'US', name: 'United States', dialCode: '+1', flag: '🇺🇸', phoneLength: 10 };
    };

    function constructFullMessage(p) {
        const parts = [];
        if (p.user_name) parts.push(`I am ${p.user_name}`);
        if (p.user_dob) {
          const userCountry = getUserCountry();
          const formattedDob = formatDobForDisplay(p.user_dob, userCountry.code);
          parts.push(`born on ${formattedDob || p.user_dob}`);
        }
        if (p.user_timeOfBirth) parts.push(`at ${p.user_timeOfBirth}`);
        if (p.user_placeOfBirth) parts.push(`in ${p.user_placeOfBirth}`);
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

        // Build metadata with user profile details for n8n
        const metadata = {
          reqId: reqId || 'unknown',
          // Always include user profile so n8n has birth details
          userName: userProfile?.user_name || null,
          dateOfBirth: userProfile?.user_dob || null,
          timeOfBirth: userProfile?.user_timeOfBirth || null,
          placeOfBirth: userProfile?.user_placeOfBirth || null,
          currentLocation: userProfile?.user_currentLocation || null,
          credits: userProfile?.user_credits ?? null,
          isPaid: (userProfile?.user_totalPaidAmount ?? 0) > 0
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
      const userCredits = currentProfile.user_credits ?? 10;
      const totalPaidAmount = currentProfile.user_totalPaidAmount ?? 0;
      const isPaidUser = totalPaidAmount > 0;
      const qrAlreadyShown = hasPaymentQRBeenShown();
      const queryCost = getQueryCreditCost(inputText);
      const config = getCreditsConfig();
      const creditsFromPayment = Math.floor(config.payment_amount_inr / 10);
      
      // IMPORTANT: Check if this is casual conversation FIRST
      // Casual messages should pass through to n8n without credit checks
      const isCasualMessage = isCasualConversation(inputText);
      console.log('[useChat] Message classification:', { text: inputText.substring(0, 50), isCasual: isCasualMessage });
      
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
        if (isPremiumAstrologyQuery(inputText) && !isHoroscopeQuery(inputText)) {
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
          const userName = currentProfile.user_name ? currentProfile.user_name.split(' ')[0] : '';
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

          addMessage({
            id: Date.now() + Math.random(),
            text: greeting + question,
            sender: 'bot',
            timestamp: new Date()
          });
        }

        setIsLoading(false);
        return;
      }

      if (!currentProfile.user_consentGiven) {
        updateProfile({ user_consentGiven: true });
        currentProfile.user_consentGiven = true;
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
                name: currentProfile.user_name,
                dateOfBirth: currentProfile.user_dob,
                timeOfBirth: currentProfile.user_timeOfBirth,
                placeOfBirth: currentProfile.user_placeOfBirth,
                consentGiven: true,
                isPaid: !!currentProfile.user_isPaid,
                last_login_location: currentProfile.user_currentLocation || ''
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
        // Call BFF instead of n8n directly
        response = await callWebhook(BFF_CHAT_ENDPOINT, webhookReqId, messageToSend, currentProfile);
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

      if (response.ok) {
        // Handle empty or non-JSON responses gracefully
        const responseText = await response.text();
        if (!responseText || responseText.trim() === '') {
          botResponseText = "I received your message but didn't get a response. Please ensure n8n workflow is properly configured and active.";
        } else {
          try {
            const data = JSON.parse(responseText);
            // BFF wraps n8n response in data.n8nResponse; fallback to direct output for backward compat
            const n8nData = (data && data.data && data.data.n8nResponse) || data;
            // Log N8N response
            try { console.log('N8N', n8nData.output || n8nData.text || JSON.stringify(n8nData)); } catch (e) {}
            botResponseText = n8nData.output || n8nData.text || JSON.stringify(n8nData);

            if (typeof botResponseText === 'string' && botResponseText.startsWith('"') && botResponseText.endsWith('"')) {
              botResponseText = botResponseText.slice(1, -1);
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
        const stored = localStorage.getItem('niyati_user_profile');
        if (stored) latestProfile = JSON.parse(stored);
      } catch (e) { /* use currentProfile */ }
      
      // Skip credit deduction for casual conversation (greetings, banter, etc.)
      const skipCreditDeduction = isCasualConversation(inputText);
      
      console.log('[useChat] Credit deduction check:', { 
        phoneNumber, 
        hasAllFields: hasAllRequiredFields(latestProfile),
        queryCost,
        isCasual: skipCreditDeduction,
        profile: { name: latestProfile.user_name, dob: latestProfile.user_dob, place: latestProfile.user_placeOfBirth, time: latestProfile.user_timeOfBirth }
      });
      
      // Allow deduction for returning users even if some profile fields are missing
      // BUT skip deduction for casual conversation
      const persistedPhone = (() => { try { return localStorage.getItem('niyati_user_phone_number'); } catch (e) { return null; } })();
      const isReturningNow = (currentProfile.user_verified && (currentProfile.user_verified.id || currentProfile.user_verified.phoneNumber)) || !!persistedPhone;
      if (phoneNumber && (hasAllRequiredFields(latestProfile) || isReturningNow) && !skipCreditDeduction) {
        const newCredits = await deductCredits(phoneNumber, queryCost);
        console.log('[useChat] Credit deduction result:', { newCredits, previousCredits: latestProfile.user_credits });
        if (newCredits !== null) {
          updateProfile({ user_credits: newCredits });
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
      const currentCredits = currentProfile.user_credits ?? config.credits_monthly_free;
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
export { getQueryCreditCost, isHoroscopeQuery, getCreditsConfig };