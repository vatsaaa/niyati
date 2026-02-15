import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { act } from 'react';
import { render, waitFor } from '@testing-library/react';

// Mocks for services used inside useChat
vi.mock('../../utils/profileExtractor', () => ({ extractProfileFields: vi.fn() }));
vi.mock('../../services/geo', () => ({
  resolveLocationAndTimezone: vi.fn().mockResolvedValue({
    location: { lat: 28.6139, lon: 77.209, display_name: 'New Delhi, India' },
    timezone: 'Asia/Kolkata'
  })
}));
vi.mock('../../services/api', () => ({
  bffFetchWithRetry: vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'ok', data: {} }) }),
  sendClientLog: vi.fn()
}));
vi.mock('../../config', () => ({
  N8N_WEBHOOK_URL: 'https://n8n.test/webhook',
  N8N_WEBHOOK_FALLBACK_URL: ''
}));

import { useChat } from '../useChat';
import { extractProfileFields } from '../../utils/profileExtractor';
import { bffFetchWithRetry } from '../../services/api';

function HookHarness({ profile, updateProfile, addMessage, auth }, ref) {
  const { handleSend, isLoading } = useChat(profile, updateProfile, addMessage, auth);
  React.useImperativeHandle(ref, () => ({ handleSend, isLoading }));
  return null;
}

const Harness = React.forwardRef(HookHarness);

describe('useChat profile save on completion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    try { localStorage.clear(); } catch (e) {}
  });

  function setupMocks() {
    // Extraction returns all fields at once (completes the profile)
    vi.mocked(extractProfileFields).mockResolvedValue({
      name: 'Ankur Vatsa',
      dob: '1979-05-19',
      timeOfBirth: '09:30',
      placeOfBirth: 'New Delhi'
    });

    // BFF classify returns casual (profile info message)
    vi.mocked(bffFetchWithRetry).mockImplementation(async (url, opts) => {
      if (typeof url === 'string' && url.includes('/chat/classify')) {
        return {
          ok: true,
          json: async () => ({
            status: 'ok',
            data: {
              queryType: 'casual', creditCost: 0, isBillable: false,
              config: { credits_horoscope_cost: 2, credits_premium_cost: 4, payment_amount_inr: 500 }
            }
          })
        };
      }
      // Default: /api/v1/users/profile or other calls
      return { ok: true, json: async () => ({ status: 'ok', data: {} }) };
    });
  }

  function createHarness(profileOverrides = {}) {
    const incompleteProfile = {
      phoneNumber: '+919899162012',
      consentGiven: true,
      credits: 10,
      totalPaidAmount: 0,
      ...profileOverrides
    };
    const updateProfile = vi.fn();
    const addMessage = vi.fn();
    const auth = {
      countries: [{ code: 'IN', name: 'India', dialCode: '+91' }],
      phoneNumber: '+919899162012'
    };
    const ref = React.createRef();
    render(React.createElement(Harness, {
      ref, profile: incompleteProfile, updateProfile, addMessage, auth
    }));
    return { ref, updateProfile, addMessage, auth };
  }

  it('calls POST /api/v1/users/profile when profile is just completed', async () => {
    setupMocks();
    const { ref } = createHarness();

    await act(async () => {
      await ref.current.handleSend(
        'I am Ankur Vatsa, born on 19 May 1979 at 09:30 am in New Delhi',
        () => {}
      );
    });

    // The profile should have been saved via POST /api/v1/users/profile
    await waitFor(() => {
      const profileSaveCall = bffFetchWithRetry.mock.calls.find(
        c => typeof c[0] === 'string' && c[0].includes('/users/profile')
      );
      expect(profileSaveCall).toBeDefined();
      // Verify the payload includes phoneNumber and consentGiven
      const bodyStr = profileSaveCall[1]?.body;
      expect(bodyStr).toBeDefined();
      const body = JSON.parse(bodyStr);
      expect(body.phoneNumber).toBe('+919899162012');
      expect(body.consentGiven).toBe(true);
    });
  });

  it('shows payment QR after profile completion for non-paid user', async () => {
    setupMocks();
    const { ref, addMessage } = createHarness({ totalPaidAmount: 0 });

    await act(async () => {
      await ref.current.handleSend(
        'I am Ankur Vatsa, born on 19 May 1979 at 09:30 am in New Delhi',
        () => {}
      );
    });

    // Should have a bot message with PayQR.jpeg image
    await waitFor(() => {
      const qrMessage = addMessage.mock.calls.find(
        c => c[0]?.image && c[0].image.includes('PayQR')
      );
      expect(qrMessage).toBeDefined();
    });
  });
});
