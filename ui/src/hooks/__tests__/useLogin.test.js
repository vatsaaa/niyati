import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/api', () => ({ bffFetch: vi.fn() }));
vi.mock('../../services/astrology', () => ({ processCompleteProfile: vi.fn() }));
vi.mock('../../utils/profile', () => ({ hasAllRequiredFields: (p) => !!(p.user_name && p.user_dob && p.user_placeOfBirth && p.user_timeOfBirth) }));
vi.mock('../../config', () => ({ N8N_WEBHOOK_URL: 'https://n8n.test/webhook' }));

import { useLogin } from '../useLogin';
import { bffFetch } from '../../services/api';
import { processCompleteProfile } from '../../services/astrology';

describe('useLogin', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // ensure fetch exists
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ output: 'ok' }) });
  });

  it('calls processCompleteProfile when profile is complete', async () => {
    const profile = { user_name: 'T', user_dob: '1990-01-01', user_placeOfBirth: 'X', user_timeOfBirth: '00:00:00' };
    bffFetch.mockResolvedValue({ ok: true, json: async () => ({ status: 'ok', data: { location: { city: 'C' } } }) });

    const auth = { login: vi.fn(), countries: [], phoneNumber: '+911234', phone: '+911234' };
    const updateProfile = vi.fn();
    const addMessage = vi.fn();

    const { handleLogin } = useLogin(auth, profile, updateProfile, addMessage);
    await handleLogin('9999', { dialCode: '+91' }, null);

    expect(processCompleteProfile).toHaveBeenCalledWith(expect.objectContaining({ user_name: 'T' }), auth.countries, auth.phoneNumber);
  });
});
