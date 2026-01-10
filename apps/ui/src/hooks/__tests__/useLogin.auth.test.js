import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/api', () => ({ bffFetch: vi.fn() }));
vi.mock('../../services/astrology', () => ({ processCompleteProfile: vi.fn() }));
vi.mock('../../utils/profile', () => ({ hasAllRequiredFields: (p) => !!(p.name && p.birthDate && p.placeOfBirth && p.timeOfBirth) }));
vi.mock('../../config', () => ({ N8N_WEBHOOK_URL: 'https://n8n.test/webhook' }));

import { useLogin } from '../useLogin';
import { bffFetch } from '../../services/api';

describe('useLogin auth flows', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // default fetch stub for external n8n call
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false });
  });

  it('first-time user triggers welcome message and updates profile consent', async () => {
    const auth = { login: vi.fn(), countries: [], phoneNumber: '+911234' };
    const profile = {};
    const updateProfile = vi.fn();
    const addMessage = vi.fn();

    bffFetch.mockResolvedValue({ ok: true, json: async () => ({ status: 'ok', data: { location: { city: 'TestCity' } } }) });

    const { handleLogin } = useLogin(auth, profile, updateProfile, addMessage);
    await handleLogin('9999', { dialCode: '+91' }, null, null);

    expect(updateProfile).toHaveBeenCalled();
    expect(addMessage).toHaveBeenCalled();
    // welcome message should be one of the predefined welcome strings
    const msg = addMessage.mock.calls[0][0];
    expect(msg).toHaveProperty('text');
    expect(msg.text).toMatch(/Welcome to Niyati|Namaste|Hello and welcome/);
  });

  it('returning user pre-fills profile and issues greeting', async () => {
    const auth = { login: vi.fn(), countries: [], phoneNumber: '+919999' };
    const profile = {};
    const updateProfile = vi.fn();
    const addMessage = vi.fn();

    // bffFetch returns location data
    bffFetch.mockResolvedValue({ ok: true, json: async () => ({ status: 'ok', data: { location: { city: 'Mumbai', lat: 19.0, lon: 72.0 } } }) });

    const identifiedUser = {
      id: 123,
      phone_number: '+919999',
      name: 'Anu Sharma',
      date_of_birth: '1990-01-01',
      time_of_birth: '00:00:00',
      place_of_birth: 'Delhi',
      consent_given: true,
      credits: 5,
      total_paid_amount: 0,
      last_login_location: 'Delhi'
    };

    const { handleLogin } = useLogin(auth, profile, updateProfile, addMessage);
    await handleLogin('9999', { dialCode: '+91' }, identifiedUser, { credits_monthly_free: 10 });

    expect(updateProfile).toHaveBeenCalled();
    // updated profile should include prefills (name -> user_name)
    const updated = updateProfile.mock.calls[0][0];
    expect(updated).toHaveProperty('name');
    expect(updated.name).toBe('Anu Sharma');

    // Greeting should be added by addMessage (bot sender)
    expect(addMessage).toHaveBeenCalled();
    const botMsg = addMessage.mock.calls.find(c => c[0] && c[0].sender === 'bot');
    expect(botMsg).toBeTruthy();
    expect(botMsg[0].text).toMatch(/Hi Anu|welcome back/i);
  });
});
