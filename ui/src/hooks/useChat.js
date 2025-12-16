import { useState } from 'react';
import { extractProfileFields } from '../utils/profileExtractor';
import { normalizeDateString, normalizeTimeString } from '../utils/normalizers';
import { resolveLocationAndTimezone } from '../services/geo';
import { formatPlaceFromLocation, formatDobForDisplay, formatTimeForDisplay } from '../utils/formatters';
import { bffFetchWithRetry, sendClientLog } from '../services/api';
import { N8N_WEBHOOK_URL, N8N_WEBHOOK_FALLBACK_URL } from '../config';
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

export function useChat(profile, updateProfile, addMessage, auth) {
  const [isLoading, setIsLoading] = useState(false);

  const handleSend = async (inputText, setInputText) => {
    if (!inputText.trim()) return;

    const userMessage = {
      id: Date.now(),
      text: inputText,
      sender: 'user',
      timestamp: new Date(),
    };
    addMessage(userMessage);
    setInputText('');
    setIsLoading(true);

    let currentProfile = { ...profile };

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
          console.warn('Place resolution failed:', err);
          addMessage({
            id: Date.now(),
            text: 'Automatic location detection failed — please enter your place of birth manually.',
            sender: 'bot',
            timestamp: new Date(),
          });
        }
      }
    }

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

    const callWebhook = async (webhookUrl, reqId, message) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000);

        try {
            const response = await fetch(webhookUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-request-id': reqId,
                    'ngrok-skip-browser-warning': 'true'
                },
                body: JSON.stringify({
                    message: message,
                    sessionId: auth.phoneNumber,
                    metadata: { reqId: reqId }
                }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            return response;
        } catch (err) {
            clearTimeout(timeoutId);
            throw err;
        }
    };

    try {
      const isReturning = currentProfile.user_verified && (currentProfile.user_verified.id || currentProfile.user_verified.phoneNumber);
      const userIsPaid = !!currentProfile.user_isPaid;
      const qrAlreadyShown = hasPaymentQRBeenShown();
      
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
      
      // For non-paid users who have already seen QR, restrict to horoscope only
      if (!userIsPaid && qrAlreadyShown && hasAllRequiredFields(currentProfile)) {
        if (!isHoroscopeQuery(inputText)) {
          addMessage({
            id: Date.now() + Math.random(),
            text: "I'd love to help you with detailed birth chart analysis and personalized predictions! However, as a free user, you can only access today's horoscope. To unlock all premium features, please complete your payment of ₹500 and share your UPI ID and 12-digit transaction ID.",
            sender: 'bot',
            timestamp: new Date()
          });
          setIsLoading(false);
          return;
        }
        // Allow horoscope queries to proceed to n8n
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
          markProfileAsSent();
        } catch (err) {
          console.warn('Failed to save profile to database:', err);
        }
      }

      // Determine what message to send to n8n:
      // - First time (profile not sent): send full profile details
      // - Subsequent times: send only the user's message
      const messageToSend = profileAlreadySent ? inputText : constructFullMessage(currentProfile);
      const webhookReqId = getSessionReqId();
      let response = null;
      let usedFallback = false;

      try {
        response = await callWebhook(N8N_WEBHOOK_URL, webhookReqId, messageToSend);
        if (response.status >= 500) {
          throw new Error(`Server error: ${response.status}`);
        }
      } catch (primaryError) {
        console.warn('Primary webhook failed:', primaryError.message);
        if (N8N_WEBHOOK_FALLBACK_URL && N8N_WEBHOOK_FALLBACK_URL !== N8N_WEBHOOK_URL) {
          usedFallback = true;
          response = await callWebhook(N8N_WEBHOOK_FALLBACK_URL, webhookReqId, messageToSend);
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
        const data = await response.json();
        botResponseText = data.output || data.text || JSON.stringify(data);

        if (typeof botResponseText === 'string' && botResponseText.startsWith('"') && botResponseText.endsWith('"')) {
          botResponseText = botResponseText.slice(1, -1);
        }
      }

      addMessage({
        id: Date.now() + 1,
        text: botResponseText,
        sender: 'bot',
        timestamp: new Date()
      });

      // For first-time users (not returning), show payment QR after n8n response - ONLY ONCE
      const isReturningUser = currentProfile.user_verified && (currentProfile.user_verified.id || currentProfile.user_verified.phoneNumber);
      if (!isReturningUser && !currentProfile.user_isPaid && !hasPaymentQRBeenShown()) {
        // Single consolidated message with QR
        addMessage({
          id: Date.now() + 2,
          image: '/payment/PayQR.jpeg',
          text: 'To unlock your complete birth chart analysis and premium features, please scan the QR code above to pay ₹500. After payment, share your UPI ID (e.g., yourname@upi) and the 12-digit UPI transaction ID for verification.',
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