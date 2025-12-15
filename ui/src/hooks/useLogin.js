import { createUUIDv4, getSessionReqId } from '../utils/uuid';
import { bffFetch } from '../services/api';
import { processCompleteProfile } from '../services/astrology';
import { formatCurrentLocationForDisplay } from '../utils/formatters';
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
      if (identifiedUser) {
        isReturningUser = true;
        if (!existing.user_name && identifiedUser.name) prefill.user_name = identifiedUser.name;
        if (!existing.user_dob && identifiedUser.date_of_birth) prefill.user_dob = identifiedUser.date_of_birth;
        if (!existing.user_timeOfBirth && identifiedUser.time_of_birth) prefill.user_timeOfBirth = identifiedUser.time_of_birth;
        if (!existing.user_placeOfBirth && identifiedUser.place_of_birth) prefill.user_placeOfBirth = identifiedUser.place_of_birth;
        if (!existing.user_consentGiven && typeof identifiedUser.consent_given !== 'undefined') {
          prefill.user_consentGiven = !!identifiedUser.consent_given;
        }
        const verified = { ...(existing.user_verified || {}) };
        if (identifiedUser.id) verified.id = identifiedUser.id;
        if (identifiedUser.phone_number) verified.phoneNumber = identifiedUser.phone_number;
        if (Object.keys(verified).length > 0) prefill.user_verified = verified;
      }

      const updatedProfile = {
        ...existing,
        ...prefill,
        user_consentGiven: true,
        user_currentLocation: currentLocationData || profile.user_currentLocation || '',
        updatedAt: new Date().toISOString(),
      };

      updateProfile(updatedProfile);

      if (isReturningUser && hasAllRequiredFields(updatedProfile) && updatedProfile.user_consentGiven) {
        const firstName = (updatedProfile.user_name || '').split(' ')[0] || '';
        const prevLocation = profile.user_currentLocation || '';
        const newLocation = formatCurrentLocationForDisplay(currentLocationData) || updatedProfile.user_currentLocation || '';

        let greetingText = '';
        if (prevLocation && newLocation && prevLocation !== newLocation) {
          greetingText = firstName
            ? `Hi ${firstName}, today you are logging in from ${newLocation}, how is it different from ${prevLocation}?`
            : `Hi, today you are logging in from ${newLocation}, how is it different from ${prevLocation}?`;
        } else {
          greetingText = firstName
            ? `Hi ${firstName}, welcome back! How is the weather in ${newLocation || 'your area'} today?`
            : `Welcome back! How is the weather in ${newLocation || 'your area'} today?`;
        }

        addMessage({ id: Date.now(), text: greetingText, sender: 'bot', timestamp: new Date() });

        const returningMessage = `${updatedProfile.user_name} is visiting again`;
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
              body: JSON.stringify({ message: returningMessage, sessionId: fullPhone, metadata: { reqId: webhookReqId, returning: true } }),
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
