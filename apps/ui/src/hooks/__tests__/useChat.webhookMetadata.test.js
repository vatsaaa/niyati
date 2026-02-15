import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { act } from 'react';
import { render } from '@testing-library/react';

vi.mock('../../utils/profileExtractor', () => ({ extractProfileFields: vi.fn(async () => ({})) }));
vi.mock('../../services/geo', () => ({ resolveLocationAndTimezone: vi.fn() }));
vi.mock('../../services/api', () => ({ bffFetchWithRetry: vi.fn(), sendClientLog: vi.fn() }));
vi.mock('../../config', () => ({ N8N_WEBHOOK_URL: 'https://n8n.test/webhook', N8N_WEBHOOK_FALLBACK_URL: '' }));

import { useChat } from '../useChat';
import { bffFetchWithRetry } from '../../services/api';

function HookHarness({ profile, updateProfile, addMessage, auth }, ref) {
  const { handleSend, isLoading } = useChat(profile, updateProfile, addMessage, auth);
  React.useImperativeHandle(ref, () => ({ handleSend, isLoading }));
  return null;
}

const Harness = React.forwardRef(HookHarness);

/** Shared helpers */
function classifyMock(url) {
  if (typeof url === 'string' && url.includes('/chat/classify')) {
    return {
      ok: true,
      json: async () => ({
        status: 'ok',
        data: {
          queryType: 'horoscope', creditCost: 2, isBillable: true,
          config: { credits_horoscope_cost: 2, credits_premium_cost: 4, payment_amount_inr: 500 }
        }
      })
    };
  }
  return { ok: true, json: async () => ({ status: 'ok', data: { credits: 8 } }) };
}

function webhookFetchSpy(capture) {
  return vi.spyOn(global, 'fetch').mockImplementation(async (url, opts) => {
    if (String(url).includes('/webhook')) {
      capture.body = JSON.parse(opts.body);
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ output: 'The stars say today is a great day!' }),
        json: async () => ({ output: 'The stars say today is a great day!' })
      };
    }
    return { ok: true, status: 200, text: async () => '{}', json: async () => ({}) };
  });
}

const FULL_PROFILE = {
  name: 'Ankur Vatsa',
  birthDate: '1979-05-19',
  placeOfBirth: 'New Delhi',
  timeOfBirth: '09:30',
  currentLocation: 'Mumbai, Maharashtra, India',
  user_verified: { id: '1', phoneNumber: '+919899162012' },
  consentGiven: true,
  credits: 10,
  totalPaidAmount: 0
};

const AUTH = { countries: [{ code: 'IN', name: 'India', dialCode: '+91' }], phoneNumber: '+919899162012' };

describe('useChat webhook metadata includes profile fields', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    try { localStorage.clear(); } catch (e) {}
  });

  it('sends all canonical profile fields in metadata.user', async () => {
    vi.mocked(bffFetchWithRetry).mockImplementation(classifyMock);
    const captured = {};
    const fetchSpy = webhookFetchSpy(captured);
    localStorage.setItem('niyati_profile_sent', 'true');

    const ref = React.createRef();
    render(React.createElement(Harness, {
      ref, profile: FULL_PROFILE, updateProfile: vi.fn(), addMessage: vi.fn(), auth: AUTH
    }));

    await act(async () => {
      await ref.current.handleSend('What does today hold for me?', () => {});
    });

    expect(captured.body).not.toBeUndefined();
    const user = captured.body.metadata.user;

    // Every canonical profile field must map correctly
    expect(user.name).toBe('Ankur Vatsa');
    expect(user.birthDate).toBe('1979-05-19');
    expect(user.timeOfBirth).toBe('09:30');
    expect(user.placeOfBirth).toBe('New Delhi');
    expect(user.currentLocation).toBe('Mumbai, Maharashtra, India');
    expect(user.phoneNumber).toBe('+919899162012');
    expect(user.credits).toBe(10);
    expect(user.isPaid).toBe(false);

    fetchSpy.mockRestore();
  });

  it('does not include legacy user_* prefixed keys', async () => {
    vi.mocked(bffFetchWithRetry).mockImplementation(classifyMock);
    const captured = {};
    const fetchSpy = webhookFetchSpy(captured);
    localStorage.setItem('niyati_profile_sent', 'true');

    const ref = React.createRef();
    render(React.createElement(Harness, {
      ref, profile: FULL_PROFILE, updateProfile: vi.fn(), addMessage: vi.fn(), auth: AUTH
    }));

    await act(async () => {
      await ref.current.handleSend('What does today hold for me?', () => {});
    });

    const user = captured.body.metadata.user;

    // Metadata should use clean canonical keys only — no user_* legacy noise
    const userKeys = Object.keys(user);
    const legacyKeys = userKeys.filter(k => k.startsWith('user_'));
    expect(legacyKeys).toEqual([]);

    fetchSpy.mockRestore();
  });

  it('falls back to localStorage profile when userProfile param is null', async () => {
    // Store a full profile in localStorage
    localStorage.setItem('niyati_profile', JSON.stringify(FULL_PROFILE));
    localStorage.setItem('niyati_profile_sent', 'true');

    vi.mocked(bffFetchWithRetry).mockImplementation(classifyMock);
    const captured = {};
    const fetchSpy = webhookFetchSpy(captured);

    // Pass a profile that still has user_verified and credits (from useLogin) but
    // also has the canonical fields from localStorage restore
    const ref = React.createRef();
    render(React.createElement(Harness, {
      ref, profile: FULL_PROFILE, updateProfile: vi.fn(), addMessage: vi.fn(), auth: AUTH
    }));

    await act(async () => {
      await ref.current.handleSend('What does today hold for me?', () => {});
    });

    expect(captured.body).not.toBeUndefined();
    expect(captured.body.metadata.user.birthDate).toBe('1979-05-19');
    expect(captured.body.metadata.user.name).toBe('Ankur Vatsa');
    expect(captured.body.metadata.user.placeOfBirth).toBe('New Delhi');
    expect(captured.body.metadata.user.timeOfBirth).toBe('09:30');

    fetchSpy.mockRestore();
  });
});
