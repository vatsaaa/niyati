import { createUUIDv4, getSessionReqId } from '../utils/uuid';
import { bffFetch } from '../services/api';
import { processCompleteProfile } from '../services/astrology';
import { formatCurrentLocationForDisplay, formatDobForDisplay, formatTimeForDisplay } from '../utils/formatters';
import { hasAllRequiredFields } from '../utils/profile';
import { N8N_WEBHOOK_URL } from '../config';

// Default config values (will be overridden by backend)
const DEFAULT_CONFIG = {
  credits_monthly_free: 10,
  credits_horoscope_cost: 2,
  credits_premium_cost: 4,
  credits_low_threshold: 4,
  payment_amount_inr: 500
};

export function useLogin(auth, profile, updateProfile, addMessage, clearMessages) {
  const handleLogin = async (phone, country, identifiedUser = null, serverConfig = null) => {
    // Input validation
    if (!phone || typeof phone !== 'string') {
      throw new Error('Phone number is required');
    }
    if (!country || !country.dialCode) {
      throw new Error('Country information is required');
    }
    
    const sanitizedPhone = phone.trim().replace(/[^0-9]/g, '');
    if (!sanitizedPhone) {
      throw new Error('Invalid phone number');
    }
    
    const fullPhone = `${country.dialCode}-${sanitizedPhone}`;
    
    // Use server config if provided, otherwise defaults
    const config = serverConfig || DEFAULT_CONFIG;

    auth.login(phone, country);

    try {
      localStorage.setItem('niyati_x_request_id', createUUIDv4());
      // Store config for useChat to access
      localStorage.setItem('niyati_credits_config', JSON.stringify(config));
      // Clear stale profile-sent flag from previous sessions so the first chat
      // message in this session always includes the full profile text and metadata.
      // Without this, a stale flag from a prior session (where n8n's conversation
      // memory may have been cleared by a restart) would cause the profile text
      // to be omitted, making the LLM ask for birth details again.
      localStorage.removeItem('niyati_profile_sent');
    } catch (e) {
      // ignore
    }

    let currentLocationData = null;
    try {
      const locationResponse = await bffFetch('/geocode/current-location', { timeout: 5000 });
      if (locationResponse.ok) {
        const locationData = await locationResponse.json();
        if (locationData.status === 'ok' && locationData.data && locationData.data.location) {
          currentLocationData = locationData.data.location;
        } else {
          console.warn('Location API returned non-ok status:', locationData.status);
        }
      } else {
        console.warn('Failed to fetch location, status:', locationResponse.status);
      }
    } catch (e) {
      console.warn('Failed to fetch current location:', e?.message || e);
    }

    try {
      const existing = profile;
      const prefill = {};
      let isReturningUser = false;
      let userCredits = config.credits_monthly_free; // Use configurable default
      let totalPaidAmount = 0;
      let lastLoginLocation = '';

      if (identifiedUser && typeof identifiedUser === 'object') {
        isReturningUser = true;
        userCredits = typeof identifiedUser.credits === 'number' ? identifiedUser.credits : config.credits_monthly_free;
        totalPaidAmount = typeof identifiedUser.total_paid_amount === 'number' ? identifiedUser.total_paid_amount : 0;
        lastLoginLocation = typeof identifiedUser.last_login_location === 'string' ? identifiedUser.last_login_location : '';
        
        if (!existing.name && identifiedUser.name) prefill.name = identifiedUser.name;
        if (!existing.birthDate && identifiedUser.date_of_birth) prefill.birthDate = identifiedUser.date_of_birth;
        if (!existing.timeOfBirth && identifiedUser.time_of_birth) prefill.timeOfBirth = identifiedUser.time_of_birth;
        if (!existing.placeOfBirth && identifiedUser.place_of_birth) prefill.placeOfBirth = identifiedUser.place_of_birth;
        if (!existing.consentGiven && typeof identifiedUser.consent_given !== 'undefined') {
          prefill.consentGiven = !!identifiedUser.consent_given;
        }
        prefill.credits = userCredits;
        prefill.totalPaidAmount = totalPaidAmount;
        prefill.lastLoginLocation = lastLoginLocation;
        
        const verified = { ...(existing.user_verified || {}) };
        if (identifiedUser.id) verified.id = identifiedUser.id;
        if (identifiedUser.phone_number) verified.phoneNumber = identifiedUser.phone_number;
        if (Object.keys(verified).length > 0) prefill.user_verified = verified;
      }

      const newLocation = formatCurrentLocationForDisplay(currentLocationData) || '';
      const hasLowCredits = userCredits <= config.credits_low_threshold;
      const isPaidUser = totalPaidAmount > 0;
      
      // Determine if location changed
      const locationChanged = lastLoginLocation && newLocation && 
        lastLoginLocation.toLowerCase() !== newLocation.toLowerCase();

      const updatedProfile = {
        ...existing,
        ...prefill,
        // Preserve the real consent value from prefill (identifiedUser) or existing profile.
        consentGiven: (typeof prefill.consentGiven !== 'undefined')
          ? prefill.consentGiven
          : (typeof existing.consentGiven !== 'undefined' ? existing.consentGiven : undefined),
        currentLocation: newLocation || existing.currentLocation || '',
        updatedAt: new Date().toISOString(),
      };

      updateProfile(updatedProfile);

      // Update last_login_location in database for returning users
        if (isReturningUser && newLocation && identifiedUser?.id) {
        try {
          // Build body and include consentOnly if we actually know the consent value
          const profileUpdateBody = {
            phoneNumber: fullPhone,
            last_login_location: newLocation,
            last_login_lat: currentLocationData?.lat || currentLocationData?.latitude || null,
            last_login_lon: currentLocationData?.lon || currentLocationData?.longitude || null
          };
          if (typeof updatedProfile.consentGiven !== 'undefined') {
            profileUpdateBody.consentGiven = !!updatedProfile.consentGiven;
          }

          const updateResponse = await bffFetch('/users/profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(profileUpdateBody),
            timeout: 5000
          });
          if (!updateResponse.ok) {
            console.warn('Failed to update last login location, status:', updateResponse.status);
          }
        } catch (e) {
          console.warn('Failed to update last login location:', e?.message || e);
        }
      }

      if (isReturningUser && hasAllRequiredFields(updatedProfile) && updatedProfile.consentGiven) {
        // Format context for n8n to generate personalized greeting
        const payingStatus = isPaidUser ? 'Paid subscriber' : 'Free user';
        const userName = updatedProfile.name || 'User';
        const firstName = userName.split(' ')[0] || userName;
        const dob = updatedProfile.birthDate || 'unknown';
        const tob = updatedProfile.timeOfBirth || 'unknown';
        const pob = updatedProfile.placeOfBirth || 'unknown place';
        const currentLoc = newLocation || 'unknown location';
        const lastLoc = lastLoginLocation || 'unknown';

        // Build location-aware instructions
        let locationInstructions = '';
        if (locationChanged) {
          locationInstructions = `IMPORTANT: User's CURRENT location has CHANGED from "${lastLoc}" to "${currentLoc}". Mention something like "I see you're logging in from ${currentLoc} today - how is it different from ${lastLoc}?" or ask about the weather/experience in the new location.`;
        } else if (currentLoc && currentLoc !== 'unknown location') {
          locationInstructions = `User is logging in from same CURRENT location (${currentLoc}). You can mention the location casually, like "How's the weather in ${currentLoc} today?"`;
        }

        // System context message - tells n8n this is a returning user login, not a user query
        // IMPORTANT: Clearly distinguish between birth place (where they were born) and current location (where they are NOW)
        const systemContext = `[SYSTEM: Returning user login - Generate a warm, personalized welcome greeting]
User: ${firstName} (${payingStatus}, ${userCredits} credits remaining)
Birth details: Born on ${dob} at ${tob} in ${pob} (this is their BIRTH PLACE, not where they are now)
CURRENT location (where they are NOW): ${currentLoc}
Previous login location: ${lastLoc}
Location changed since last login: ${locationChanged ? 'YES' : 'NO'}

${locationInstructions}

CRITICAL: When greeting the user, reference their CURRENT LOCATION (${currentLoc}), NOT their birth place (${pob}). Say something like "great to see you from ${currentLoc}" or "how's ${currentLoc} today?". Do NOT say "back from ${pob}" - that's where they were BORN, not where they are logging in from.

Instructions: Welcome this returning user warmly. Keep it brief and friendly - this is just a greeting, not a prophecy.`;

        // Send to n8n and let it generate the personalized greeting
        (async () => {
          try {
            const webhookReqId = getSessionReqId();
            // Log system-generated message sent to N8N
            try { console.log('NIYATI', systemContext); } catch (e) {}
            const response = await fetch(N8N_WEBHOOK_URL, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-request-id': webhookReqId,
                'ngrok-skip-browser-warning': 'true',
              },
              body: JSON.stringify({ 
                message: systemContext, 
                sessionId: fullPhone, 
                metadata: { 
                  reqId: webhookReqId, 
                  returning: true,
                  isSystemContext: true,
                  credits: userCredits,
                  isPaid: isPaidUser,
                        user: {
                          name: firstName,
                          birthDate: dob,
                          timeOfBirth: tob,
                          placeOfBirth: pob,
                          currentLocation: currentLoc
                        },
                  lastLoginLocation: lastLoc,
                  locationChanged
                } 
              }),
            });
            if (response.ok) {
              const data = await response.json();
              try { console.log('N8N', data.output || data.text || JSON.stringify(data)); } catch (e) {}
              const botResponseText = data.output || data.text || JSON.stringify(data);
              addMessage({
                id: Date.now(),
                text: (typeof botResponseText === 'string' && botResponseText.startsWith('\"') && botResponseText.endsWith('\"'))
                  ? botResponseText.slice(1, -1)
                  : botResponseText,
                sender: 'bot',
                timestamp: new Date(),
              });
            } else {
              // Fallback greeting if n8n fails - use location-aware message
              const fallbackMsg = locationChanged
                ? `Hi ${firstName}, welcome back! I see you're logging in from ${currentLoc} today - quite different from ${lastLoc}!`
                : `Hi ${firstName}, welcome back! How's the weather in ${currentLoc} today?`;
              try { console.log('N8N', 'fallback', fallbackMsg); } catch (e) {}
              addMessage({ id: Date.now(), text: fallbackMsg, sender: 'bot', timestamp: new Date() });
            }
          } catch (e) {
            console.warn('Failed to get personalized greeting from N8N:', e);
            // Fallback greeting
            const fallbackMsg = locationChanged
              ? `Hi ${firstName}, welcome back! I see you're logging in from ${newLocation} today - quite different from ${lastLoginLocation}!`
              : `Hi ${firstName}, welcome back!`;
            addMessage({ id: Date.now(), text: fallbackMsg, sender: 'bot', timestamp: new Date() });
          }

          // Additionally, for returning users we synthesize a concise English
          // message containing their known profile details and send it to n8n
          // (so downstream workflows receive a human-readable profile summary).
          try {
            const synthParts = [];
            if (updatedProfile.name) synthParts.push(`My name is ${updatedProfile.name}`);
            if (updatedProfile.birthDate) synthParts.push(`born on ${formatDobForDisplay(updatedProfile.birthDate) || updatedProfile.birthDate}`);
            if (updatedProfile.timeOfBirth) synthParts.push(`at ${formatTimeForDisplay(updatedProfile.timeOfBirth) || updatedProfile.timeOfBirth}`);
            if (updatedProfile.placeOfBirth) synthParts.push(`in ${updatedProfile.placeOfBirth}`);
            if (updatedProfile.currentLocation) synthParts.push(`I currently live in ${updatedProfile.currentLocation}`);
            const synthesized = synthParts.join('. ') + '.';

            const synthReqId = getSessionReqId();
            // mark locally that profile has been sent for this session to avoid duplicate posts
            try { localStorage.setItem('niyati_profile_sent', 'true'); } catch (e) { /* ignore */ }

            // send synthesized profile to n8n as a lightweight profile message
            await fetch(N8N_WEBHOOK_URL, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-request-id': synthReqId,
                'ngrok-skip-browser-warning': 'true'
              },
                body: JSON.stringify({ message: synthesized, sessionId: fullPhone, metadata: { reqId: synthReqId, returning: true, isProfileSynthesis: true, user: { name: updatedProfile.name || null, birthDate: updatedProfile.birthDate || null, timeOfBirth: updatedProfile.timeOfBirth || null, placeOfBirth: updatedProfile.placeOfBirth || null, currentLocation: updatedProfile.currentLocation || null } } })
            }).catch(err => console.warn('Failed to send synthesized profile to n8n:', err));
          } catch (e) {
            // swallow errors from synthesis to avoid affecting UI
            console.warn('Profile synthesis/send failed:', e);
          }

          // Show payment prompt for users with low credits - single consolidated message
          if (hasLowCredits) {
            const creditsFromPayment = Math.floor(config.payment_amount_inr / 10);
            addMessage({
              id: Date.now() + 2,
              image: '/payment/PayQR.jpeg',
              text: `You have ${userCredits} credits remaining. To enjoy our premium astrology services, scan the QR code above to pay ₹${config.payment_amount_inr} (adds ${creditsFromPayment} credits). After payment, share your UPI ID (e.g., yourname@upi) and the 12-digit UPI transaction ID for verification.`,
              sender: 'bot',
              timestamp: new Date(),
            });
            // Mark QR as shown
            try { localStorage.setItem('niyati_payment_qr_shown', 'true'); } catch (e) { }
          }
        })();
      } else if (hasAllRequiredFields(updatedProfile) && updatedProfile.consentGiven) {
        processCompleteProfile(updatedProfile, auth.countries, auth.phoneNumber);
      } else if (!isReturningUser) {
        // Clear any generic initial greeting that may have been added by
        // the messages initializer so we don't show duplicate welcomes.
        try {
          if (typeof clearMessages === 'function') clearMessages();
          else {
            // Best-effort fallback: clear persisted chat history so addMessage
            // will start from a clean slate. The in-memory messages state
            // will be cleared only if the caller passed `clearMessages`.
            localStorage.setItem('niyati_chat_history', JSON.stringify([]));
          }
        } catch (e) {
          // ignore
        }
        // New user - welcome them and ask for their details
        const welcomeMessages = [
          "Welcome to Niyati! I am your personal astrology guide. To create your birth chart and reveal what destiny has in store for you, I need a few details. Could you please tell me your full name, date of birth, time of birth, and place of birth?",
          "Namaste! I am Niyati, your cosmic companion. To unveil the secrets written in your stars, please share your full name, date of birth (DD/MM/YYYY), time of birth, and birthplace.",
          "Hello and welcome! I am Niyati, here to help you discover your astrological destiny. To get started, could you please share your name, when you were born (date and time), and where you were born?"
        ];
        const randomWelcome = welcomeMessages[Math.floor(Math.random() * welcomeMessages.length)];
        addMessage({
          id: Date.now(),
          text: randomWelcome,
          sender: 'bot',
          timestamp: new Date(),
        });
      }
    } catch (e) {
      // ignore
    }
  };

  return { handleLogin };
}
