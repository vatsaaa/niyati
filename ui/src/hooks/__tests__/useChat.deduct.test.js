import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { act } from 'react';
import { render } from '@testing-library/react';

vi.mock('../../utils/profileExtractor', () => ({ extractProfileFields: vi.fn(async () => ({})) }));
vi.mock('../../services/geo', () => ({ resolveLocationAndTimezone: vi.fn() }));
vi.mock('../../services/api', () => ({ bffFetchWithRetry: vi.fn(), sendClientLog: vi.fn() }));
vi.mock('../../config', () => ({ N8N_WEBHOOK_URL: 'https://n8n.test/webhook', N8N_WEBHOOK_FALLBACK_URL: '' }));

import { useChat } from '../useChat';

function HookHarness({ profile, updateProfile, addMessage, auth }, ref) {
  const { handleSend, isLoading } = useChat(profile, updateProfile, addMessage, auth);
  React.useImperativeHandle(ref, () => ({ handleSend, isLoading }));
  return null;
}

const { forwardRef } = React;
const Harness = forwardRef(HookHarness);

describe('useChat deduction flow', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('calls deduct-credits after successful webhook when profile complete', async () => {
    const profile = {
      user_name: 'Ankur',
      user_dob: '1990-05-19',
      user_placeOfBirth: 'Mumbai',
      user_timeOfBirth: '09:30',
      user_verified: { id: '1', phoneNumber: '+91-9992223333' },
      user_consentGiven: true,
      user_credits: 10
    };

    const updateProfile = vi.fn();
    const addMessage = vi.fn();
    const auth = { countries: [{ code: 'IN', name: 'India', dialCode: '+91' }], phoneNumber: '+91-9992223333' };

    // Mock fetch: first call is webhook (n8n), second call is deduct-credits
    const fetchMock = vi.spyOn(global, 'fetch').mockImplementation(async (url, opts) => {
      if (String(url).includes('/webhook')) {
        return { ok: true, json: async () => ({ output: 'stubbed response' }) };
      }
      if (String(url).includes('/deduct-credits')) {
        // return updated credits = 8
        return { ok: true, json: async () => ({ data: { credits: 8 } }) };
      }
      // geocode current-location or profile save
      return { ok: true, json: async () => ({ status: 'ok', data: {} }) };
    });

    const ref = React.createRef();
    render(React.createElement(Harness, { ref, profile, updateProfile, addMessage, auth }));

    await act(async () => {
      await ref.current.handleSend("Hi Niyati, give me today's horoscope", () => {});
    });

    // Expect deduct call happened and profile updated with new credits
    expect(fetchMock).toHaveBeenCalled();
    expect(updateProfile).toHaveBeenCalledWith(expect.objectContaining({ user_credits: 8 }));

    fetchMock.mockRestore();
  });
});
