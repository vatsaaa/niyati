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

describe('useChat classify failure handling', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('does NOT call deduct-credits when classify endpoint returns 401', async () => {
    const { bffFetchWithRetry } = await import('../../services/api');
    const profile = {
      name: 'Ankur',
      birthDate: '1979-05-19',
      placeOfBirth: 'New Delhi',
      timeOfBirth: '07:31',
      user_verified: { id: '1', phoneNumber: '+91-9992223333' },
      consentGiven: true,
      credits: 10
    };

    const updateProfile = vi.fn();
    const addMessage = vi.fn();
    const auth = { countries: [{ code: 'IN', name: 'India', dialCode: '+91' }], phoneNumber: '+91-9992223333' };

    // Mock bffFetchWithRetry to return 401 for classify endpoint
    vi.mocked(bffFetchWithRetry).mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ status: 'error', error: 'unauthorized' })
    });

    const fetchMock = vi.spyOn(global, 'fetch').mockImplementation(async (url, opts) => {
      const s = String(url);
      if (s.includes('/webhook/')) {
        // n8n webhook returns a valid reply
        return { ok: true, text: async () => JSON.stringify({ output: 'stubbed n8n response' }) };
      }
      if (s.includes('/api/v1/users/deduct-credits')) {
        // If deduct is called, this will indicate regression; return a success payload
        return { ok: true, json: async () => ({ data: { credits: 8 } }) };
      }
      // Default responses for other endpoints
      return { ok: true, json: async () => ({ status: 'ok', data: {} }), text: async () => JSON.stringify({}) };
    });

    const ref = React.createRef();
    render(React.createElement(Harness, { ref, profile, updateProfile, addMessage, auth }));

    await act(async () => {
      await ref.current.handleSend("Hi Niyati, give me today's horoscope", () => {});
    });

    // Assert classify was called (via bffFetchWithRetry) and deduct-credits was NOT called
    expect(bffFetchWithRetry).toHaveBeenCalled();
    const calls = fetchMock.mock.calls.map(c => String(c[0]));
    expect(calls.some(u => u.includes('/api/v1/users/deduct-credits'))).toBe(false);

    fetchMock.mockRestore();
  });
});
