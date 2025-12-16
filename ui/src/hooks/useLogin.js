import { createUUIDv4, getSessionReqId } from '../utils/uuid';
import { bffFetch } from '../services/api';
import { processCompleteProfile } from '../services/astrology';
import { formatCurrentLocationForDisplay, formatDobForDisplay, formatTimeForDisplay } from '../utils/formatters';
import { hasAllRequiredFields } from '../utils/profile';
import { N8N_WEBHOOK_URL } from '../config';

export function useLogin(auth, profile, updateProfile, addMessage) {
  const handleLogin = async (phone, country, identifiedUser = null) => {
    const fullPhone = `${country.dialCode}-${phone.trim()}`;

    auth.login(phone, country);

    try {
      localStorage.setItem('niyati_x_request_id', createUUIDv4());
    } catch (e) {
      // ignore
    }

    let currentLocationData = null;
    try {
      const locationResponse = await bffFetch('/geocode/current-location');
      if (locationResponse.ok) {
        const locationData = await locationResponse.json();
        if (locationData.status === 'ok' && locationData.data && locationData.data.location) {
          currentLocationData = locationData.data.location;
        }
      }
    } catch (e) {
      console.warn('Failed to fetch current location:', e);
    }

    try {
      const existing = profile;
      const prefill = {};
      let isReturningUser = false;
      let isPaidUser = false;
      let lastLoginLocation = '';

      if (identifiedUser) {
        isReturningUser = true;
        isPaidUser = !!identifiedUser.is_paid;
        lastLoginLocation = identifiedUser.last_login_location || '';
        
        if (!existing.user_name && identifiedUser.name) prefill.user_name = identifiedUser.name;
        if (!existing.user_dob && identifiedUser.date_of_birth) prefill.user_dob = identifiedUser.date_of_birth;
        if (!existing.user_timeOfBirth && identifiedUser.time_of_birth) prefill.user_timeOfBirth = identifiedUser.time_of_birth;
        if (!existing.user_placeOfBirth && identifiedUser.place_of_birth) prefill.user_placeOfBirth = identifiedUser.place_of_birth;
        if (!existing.user_consentGiven && typeof identifiedUser.consent_given !== 'undefined') {
          prefill.user_consentGiven = !!identifiedUser.consent_given;
        }
        prefill.user_isPaid = isPaidUser;
        prefill.user_lastLoginLocation = lastLoginLocation;
        
        const verified = { ...(existing.user_verified || {}) };
        if (identifiedUser.id) verified.id = identifiedUser.id;
        if (identifiedUser.phone_number) verified.phoneNumber = identifiedUser.phone_number;
        if (Object.keys(verified).length > 0) prefill.user_verified = verified;
      }

      const newLocation = formatCurrentLocationForDisplay(currentLocationData) || '';

      const updatedProfile = {
        ...existing,
        ...prefill,
        user_consentGiven: true,
        user_currentLocation: newLocation || existing.user_currentLocation || '',
        updatedAt: new Date().toISOString(),
      };

      updateProfile(updatedProfile);

      if (isReturningUser && hasAllRequiredFields(updatedProfile) && updatedProfile.user_consentGiven) {
        // Format context for n8n to generate personalized greeting
        const payingStatus = isPaidUser ? 'Paid subscriber' : 'Free user';
        const userName = updatedProfile.user_name || 'User';
        const firstName = userName.split(' ')[0] || userName;
        const dob = updatedProfile.user_dob || 'unknown';
        const tob = updatedProfile.user_timeOfBirth || 'unknown';
        const pob = updatedProfile.user_placeOfBirth || 'unknown place';
        const currentLoc = newLocation || 'unknown location';
        const lastLoc = lastLoginLocation || 'unknown';

        // System context message - tells n8n this is a returning user login, not a user query
        // n8n should generate a personalized welcome greeting based on this context
        const systemContext = `[SYSTEM: Returning user login - Generate a warm, personalized welcome greeting]
User: ${firstName} (${payingStatus})
Birth: ${dob} at ${tob} in ${pob}
Current location: ${currentLoc}
Last login location: ${lastLoc}
Instructions: Welcome this returning user warmly. Reference their location if interesting (same or different from last time). Keep it brief and friendly - this is just a greeting, not a prophecy.`;

        // Send to n8n and let it generate the personalized greeting
        (async () => {
          try {
            const webhookReqId = getSessionReqId();
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
                  isPaid: isPaidUser,
                  userName: firstName,
                  dob,
                  tob,
                  pob,
                  currentLocation: currentLoc,
                  lastLoginLocation: lastLoc
                } 
              }),
            });

            if (response.ok) {
              const data = await response.json();
              const botResponseText = data.output || data.text || JSON.stringify(data);
              addMessage({
                id: Date.now(),
                text: (typeof botResponseText === 'string' && botResponseText.startsWith('"') && botResponseText.endsWith('"'))
                  ? botResponseText.slice(1, -1)
                  : botResponseText,
                sender: 'bot',
                timestamp: new Date(),
              });
            } else {
              // Fallback greeting if n8n fails
              addMessage({ id: Date.now(), text: `Hi ${firstName}, welcome back!`, sender: 'bot', timestamp: new Date() });
            }
          } catch (e) {
            console.warn('Failed to get personalized greeting from N8N:', e);
            // Fallback greeting
            addMessage({ id: Date.now(), text: `Hi ${firstName}, welcome back!`, sender: 'bot', timestamp: new Date() });
          }

          // Show payment prompt for non-paid returning users - single consolidated message
          if (!isPaidUser) {
            addMessage({
              id: Date.now() + 2,
              image: '/payment/PayQR.jpeg',
              text: 'To continue enjoying our premium astrology services, please scan the QR code above to pay ₹500. After payment, share your UPI ID (e.g., yourname@upi) and the 12-digit UPI transaction ID for verification.',
              sender: 'bot',
              timestamp: new Date(),
            });
            // Mark QR as shown
            try { localStorage.setItem('niyati_payment_qr_shown', 'true'); } catch (e) { }
          }
        })();
      } else if (hasAllRequiredFields(updatedProfile) && updatedProfile.user_consentGiven) {
        processCompleteProfile(updatedProfile, auth.countries, auth.phoneNumber);
      } else if (!isReturningUser) {
        // New user - welcome them and ask for their details
        const welcomeMessages = [
          "Welcome to Niyati! I'm your personal astrology guide. To create your birth chart and reveal what destiny has in store for you, I'll need a few details. Could you please tell me your full name, date of birth, time of birth, and place of birth?",
          "Namaste! I'm Niyati, your cosmic companion. To unveil the secrets written in your stars, please share your full name, date of birth (DD/MM/YYYY), time of birth, and birthplace.",
          "Hello and welcome! I'm Niyati, here to help you discover your astrological destiny. To get started, could you share your name, when you were born (date and time), and where you were born?"
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
