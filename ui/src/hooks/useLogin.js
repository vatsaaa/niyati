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
        // Format the returning user message as specified
        const payingStatus = isPaidUser ? 'Paying' : 'Non-paying';
        const userName = updatedProfile.user_name || 'User';
        const dob = formatDobForDisplay(updatedProfile.user_dob, country.code) || updatedProfile.user_dob || 'unknown';
        const tob = formatTimeForDisplay(updatedProfile.user_timeOfBirth) || updatedProfile.user_timeOfBirth || 'unknown time';
        const pob = updatedProfile.user_placeOfBirth || 'unknown place';
        const currentLoc = newLocation || 'unknown location';
        const lastLoc = lastLoginLocation || 'unknown';

        const returningMessage = `${payingStatus} ${userName}, born on ${dob} at ${tob} at ${pob} has logged in from ${currentLoc} and their last login place was ${lastLoc}`;

        // Show greeting to user
        const firstName = userName.split(' ')[0] || '';
        let greetingText = firstName
          ? `Hi ${firstName}, welcome back!`
          : `Welcome back!`;
        
        addMessage({ id: Date.now(), text: greetingText, sender: 'bot', timestamp: new Date() });

        // Send to n8n
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
                message: returningMessage, 
                sessionId: fullPhone, 
                metadata: { 
                  reqId: webhookReqId, 
                  returning: true,
                  isPaid: isPaidUser,
                  userName,
                  dob: updatedProfile.user_dob,
                  tob: updatedProfile.user_timeOfBirth,
                  pob: updatedProfile.user_placeOfBirth,
                  currentLocation: currentLoc,
                  lastLoginLocation: lastLoc
                } 
              }),
            });

            if (response.ok) {
              const data = await response.json();
              const botResponseText = data.output || data.text || JSON.stringify(data);
              addMessage({
                id: Date.now() + 1,
                text: (typeof botResponseText === 'string' && botResponseText.startsWith('"') && botResponseText.endsWith('"'))
                  ? botResponseText.slice(1, -1)
                  : botResponseText,
                sender: 'bot',
                timestamp: new Date(),
              });
            }
          } catch (e) {
            console.warn('Failed to send returning user message to N8N:', e);
          }

          // Show payment prompt for non-paid returning users
          if (!isPaidUser) {
            addMessage({
              id: Date.now() + 2,
              text: 'To continue enjoying our premium astrology services, please complete your payment of ₹500.',
              sender: 'bot',
              timestamp: new Date(),
            });
            addMessage({
              id: Date.now() + 3,
              image: '/payment/PayQR.jpeg',
              text: 'Scan the QR code above to pay ₹500. After payment, please share your transaction ID to verify.',
              sender: 'bot',
              timestamp: new Date(),
            });
          }
        })();
      } else if (hasAllRequiredFields(updatedProfile) && updatedProfile.user_consentGiven) {
        processCompleteProfile(updatedProfile, auth.countries, auth.phoneNumber);
      }
    } catch (e) {
      // ignore
    }
  };

  return { handleLogin };
}
