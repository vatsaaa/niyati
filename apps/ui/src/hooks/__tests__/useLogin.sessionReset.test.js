import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/api', () => ({ bffFetch: vi.fn() }));
vi.mock('../../services/astrology', () => ({ processCompleteProfile: vi.fn() }));
vi.mock('../../utils/profile', () => ({ hasAllRequiredFields: (p) => !!(p.name && p.birthDate && p.placeOfBirth && p.timeOfBirth) }));
vi.mock('../../config', () => ({ N8N_WEBHOOK_URL: 'https://n8n.test/webhook' }));

import { useLogin } from '../useLogin';
import { bffFetch } from '../../services/api';

describe('useLogin session reset', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ output: 'ok' }) });
  });

  it('clears stale niyati_profile_sent flag on new login', async () => {
    // Simulate a stale flag from a previous session
    localStorage.setItem('niyati_profile_sent', 'true');
    expect(localStorage.getItem('niyati_profile_sent')).toBe('true');

    const auth = { login: vi.fn(), countries: [], phoneNumber: '+911234' };
    const profile = {};
    const updateProfile = vi.fn();
    const addMessage = vi.fn();

    bffFetch.mockResolvedValue({ ok: true, json: async () => ({ status: 'ok', data: { location: { city: 'C' } } }) });

    const { handleLogin } = useLogin(auth, profile, updateProfile, addMessage);
    await handleLogin('9999', { dialCode: '+91' }, null, null);

    // The stale flag should have been cleared at the start of login
    // (it may be re-set later by returning user profile synthesis, but the
    // important thing is that it's cleared first so a fresh session can start)
    // For a first-time user (identifiedUser = null), it should remain cleared
    expect(localStorage.getItem('niyati_profile_sent')).toBeNull();
  });

  it('returning user re-sets flag after profile synthesis', async () => {
    // Simulate stale flag
    localStorage.setItem('niyati_profile_sent', 'true');

    const auth = { login: vi.fn(), countries: [], phoneNumber: '+919999' };
    const profile = {};
    const updateProfile = vi.fn();
    const addMessage = vi.fn();

    bffFetch.mockResolvedValue({ ok: true, json: async () => ({ status: 'ok', data: { location: { city: 'Mumbai' } } }) });

    const identifiedUser = {
      id: 123,
      name: 'Test User',
      date_of_birth: '1990-05-15',
      time_of_birth: '10:30:00',
      place_of_birth: 'Delhi',
      consent_given: true,
      credits: 10,
      total_paid_amount: 0,
      last_login_location: 'Delhi'
    };

    const { handleLogin } = useLogin(auth, profile, updateProfile, addMessage);
    await handleLogin('9999', { dialCode: '+91' }, identifiedUser, { credits_monthly_free: 10 });

    // The returning user path sends profile synthesis to n8n in a fire-and-forget
    // async IIFE. We need to flush all pending microtasks before asserting.
    await new Promise(resolve => setTimeout(resolve, 50));

    // For a returning user, the flag should be re-set after profile synthesis
    // (the synthesized profile message is sent to n8n during login)
    expect(localStorage.getItem('niyati_profile_sent')).toBe('true');
  });
});
