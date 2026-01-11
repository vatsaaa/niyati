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

describe('useChat follow-up deduction heuristic', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('deducts for a follow-up like "yes, elaborate" when previous query was billable', async () => {
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

    // Mock fetch: webhook calls and deduct-credits calls. We'll decrement credits on each deduct call.
    let currentCredits = 10;
    const fetchMock = vi.spyOn(global, 'fetch').mockImplementation(async (url, opts) => {
      if (String(url).includes('/webhook')) {
        return { ok: true, status: 200, text: async () => JSON.stringify({ output: 'n8n response' }), json: async () => ({ output: 'n8n response' }) };
      }
      if (String(url).includes('/deduct-credits')) {
        try {
          const body = JSON.parse(opts.body || '{}');
          const amt = parseInt(body.amount, 10) || 0;
          currentCredits = Math.max(0, currentCredits - amt);
        } catch (e) {}
        return { ok: true, status: 200, json: async () => ({ data: { credits: currentCredits } }) };
      }
      // profile save or others
      return { ok: true, status: 200, json: async () => ({}) };
    });

    const ref = React.createRef();
    render(React.createElement(Harness, { ref, profile, updateProfile, addMessage, auth }));

    // First send: billable horoscope question
    await act(async () => {
      await ref.current.handleSend("What does today hold for me?", () => {});
    });

    // Second send: follow-up short confirmatory asking to elaborate
    await act(async () => {
      await ref.current.handleSend('Yes, elaborate and suggest some practical actions', () => {});
    });

    // After two billable interactions (2 credits each), currentCredits should be 6
    expect(currentCredits).toBe(6);

    fetchMock.mockRestore();
  });
});
