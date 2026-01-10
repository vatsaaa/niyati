import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/api', () => ({ bffFetch: vi.fn() }));
vi.mock('../../services/astrology', () => ({ processCompleteProfile: vi.fn() }));
vi.mock('../../utils/profile', () => ({ hasAllRequiredFields: (p) => !!(p.name && p.birthDate && p.placeOfBirth && p.timeOfBirth) }));
vi.mock('../../config', () => ({ N8N_WEBHOOK_URL: 'https://n8n.test/webhook' }));

import { useLogin } from '../useLogin';
import { bffFetch } from '../../services/api';

describe('useLogin location-aware greetings', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // default fetch stub for n8n; tests will override as needed
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false });
  });

  it('sends n8n payload and uses n8n response when available (location changed)', async () => {
    const auth = { login: vi.fn(), countries: [], phoneNumber: '+919111' };
    const profile = {};
    const updateProfile = vi.fn();
    const addMessage = vi.fn();

    // bffFetch: current-location then profile update
    bffFetch.mockImplementation(async (path, opts) => {
      if (path === '/geocode/current-location') {
        return { ok: true, json: async () => ({ status: 'ok', data: { location: { city: 'Mumbai', lat: 19.0, lon: 72.0 } } }) };
      }
      if (path === '/users/profile') {
        return { ok: true };
      }
      return { ok: false };
    });

    // Mock n8n to return a personalized message
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ output: 'Hello from n8n: customised greeting' }) });

    const identifiedUser = {
      id: 321,
      phone_number: '+919111',
      name: 'Ravi Kumar',
      date_of_birth: '1992-05-05',
      time_of_birth: '05:05:00',
      place_of_birth: 'Pune',
      consent_given: true,
      credits: 8,
      total_paid_amount: 0,
      last_login_location: 'Pune'
    };

    const { handleLogin } = useLogin(auth, profile, updateProfile, addMessage);
    await handleLogin('9111', { dialCode: '+91' }, identifiedUser, { credits_monthly_free: 10, payment_amount_inr: 500 });

    // allow the background n8n async IIFE to run
    await new Promise(r => setTimeout(r, 20));

    // n8n returned content should be posted as a bot message
    const botMsg = addMessage.mock.calls.find(c => c[0] && c[0].sender === 'bot');
    expect(botMsg).toBeTruthy();
    expect(botMsg[0].text).toContain('Hello from n8n');

    // profile update should have been called (to save last login location)
    expect(bffFetch).toHaveBeenCalled();
    const profileUpdateCall = bffFetch.mock.calls.find(c => c[0] === '/users/profile');
    expect(profileUpdateCall).toBeTruthy();
  });

  it('falls back to location-aware message when n8n fails (same location)', async () => {
    const auth = { login: vi.fn(), countries: [], phoneNumber: '+919222' };
    const profile = {};
    const updateProfile = vi.fn();
    const addMessage = vi.fn();

    bffFetch.mockImplementation(async (path, opts) => {
      if (path === '/geocode/current-location') {
        return { ok: true, json: async () => ({ status: 'ok', data: { location: { city: 'Pune', lat: 18.5, lon: 73.8 } } }) };
      }
      if (path === '/users/profile') {
        return { ok: true };
      }
      return { ok: false };
    });

    // n8n fails (non-ok) to trigger fallback path
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false });

    const identifiedUser = {
      id: 654,
      phone_number: '+919222',
      name: 'Meera Patel',
      date_of_birth: '1988-08-08',
      time_of_birth: '08:08:00',
      place_of_birth: 'Pune',
      consent_given: true,
      credits: 3,
      total_paid_amount: 0,
      last_login_location: 'Pune'
    };

    const { handleLogin } = useLogin(auth, profile, updateProfile, addMessage);
    await handleLogin('9222', { dialCode: '+91' }, identifiedUser, { credits_monthly_free: 10 });

    // allow the background n8n async IIFE to run
    await new Promise(r => setTimeout(r, 20));

    // fallback bot message should reference the current location
    const botMsg = addMessage.mock.calls.find(c => c[0] && c[0].sender === 'bot');
    expect(botMsg).toBeTruthy();
    expect(botMsg[0].text).toMatch(/How's the weather in Pune|welcome back/i);
  });
});
