import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, act } from '@testing-library/react';

// Mocks for services used inside useChat
vi.mock('../../utils/profileExtractor', () => ({ extractProfileFields: vi.fn() }));
vi.mock('../../services/geo', () => ({ resolveLocationAndTimezone: vi.fn() }));
vi.mock('../../services/api', () => ({ bffFetchWithRetry: vi.fn(), sendClientLog: vi.fn() }));
vi.mock('../../config', () => ({ N8N_WEBHOOK_URL: 'https://n8n.test/webhook', N8N_WEBHOOK_FALLBACK_URL: '' }));

import { useChat } from '../useChat';
import { extractProfileFields } from '../../utils/profileExtractor';
import { bffFetchWithRetry } from '../../services/api';

function HookHarness({ profile, updateProfile, addMessage, auth }, ref) {
  const { handleSend, isLoading } = useChat(profile, updateProfile, addMessage, auth);
  React.useImperativeHandle(ref, () => ({ handleSend, isLoading }));
  return null;
}

const { forwardRef } = React;
const Harness = forwardRef(HookHarness);

describe('useChat onboarding & free-tier behavior', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Clear localStorage between tests
    try { localStorage.clear(); } catch (e) {}
  });

  it('saves extracted profile, posts to /users/profile and then calls webhook with full profile', async () => {
    const profile = {
      user_name: null,
      user_dob: null,
      user_placeOfBirth: null,
      user_timeOfBirth: null,
      user_verified: null,
      user_consentGiven: false,
      user_credits: 10
    };

    const updateProfile = vi.fn();
    const addMessage = vi.fn();
    const auth = { countries: [{ code: 'IN', name: 'India', dialCode: '+91' }], phoneNumber: '+91-9992223333' };

    // Extracted fields from user's free-form message
    extractProfileFields.mockResolvedValue({
      name: 'Ankur Test',
      dob: '1990-05-19',
      timeOfBirth: '09:30',
      placeOfBirth: 'Mumbai, India'
    });

    // bffFetchWithRetry (profile save) resolves OK
    bffFetchWithRetry.mockResolvedValue({ ok: true, json: async () => ({ status: 'ok', data: { user: { phone_number: '+91-9992223333' } } }) });

    // Spy on global.fetch to observe webhook call
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (url, opts) => {
      if (String(url).includes('/webhook')) {
        return { ok: true, status: 200, json: async () => ({ output: 'welcome from n8n' }) };
      }
      return { ok: true, json: async () => ({}) };
    });

    const ref = React.createRef();
    render(React.createElement(Harness, { ref, profile, updateProfile, addMessage, auth }));

    await act(async () => {
      await ref.current.handleSend("I am Ankur Test. Date of birth: 1990-05-19. Time: 09:30. Place: Mumbai, India", () => {});
    });

    // Expect profile save to backend
    expect(bffFetchWithRetry).toHaveBeenCalledWith('/users/profile', expect.objectContaining({ method: 'POST' }), expect.any(Object));

    // Expect webhook to be called with a message that includes the reconstructed profile text
    expect(fetchSpy).toHaveBeenCalled();
    const webhookCall = fetchSpy.mock.calls.find(c => String(c[0]).includes('/webhook'));
    expect(webhookCall).toBeTruthy();
    const webhookBody = JSON.parse(webhookCall[1].body);
    expect(String(webhookBody.message)).toContain('I am Ankur Test');

    // Profile sent marker should be stored in localStorage
    expect(localStorage.getItem('niyati_profile_sent')).toBe('true');

    fetchSpy.mockRestore();
  });

  it('polietly informs unpaid users (QR shown) that only today questions are allowed', async () => {
    // Pre-mark that payment QR has been shown (simulate earlier flow)
    localStorage.setItem('niyati_payment_qr_shown', 'true');

    const profile = {
      user_name: 'Ankur',
      user_dob: '1990-05-19',
      user_placeOfBirth: 'Mumbai',
      user_timeOfBirth: '09:30',
      user_verified: { id: '1', phoneNumber: '+91-9992223333' },
      user_consentGiven: true,
      user_credits: 8,
      user_totalPaidAmount: 0
    };

    const updateProfile = vi.fn();
    const addMessage = vi.fn();
    const auth = { countries: [{ code: 'IN', name: 'India', dialCode: '+91' }], phoneNumber: '+91-9992223333' };

    // Spy on global.fetch to ensure we do NOT contact the webhook for out-of-scope question
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async () => ({ ok: true, json: async () => ({}) }));

    const ref = React.createRef();
    render(React.createElement(Harness, { ref, profile, updateProfile, addMessage, auth }));

    await act(async () => {
      await ref.current.handleSend("Will I be promoted next year?", () => {});
    });

    // Expect the hook to have replied with a polite restriction message
    const botCalls = addMessage.mock.calls.filter(c => c[0] && c[0].sender === 'bot');
    expect(botCalls.length).toBeGreaterThan(0);
    const replyTexts = botCalls.map(c => c[0].text).join('\n');
    expect(replyTexts).toMatch(/free user/i);
    expect(replyTexts).toMatch(/today's horoscope|today/i);

    // No webhook call should have been made for an out-of-scope free question
    const webhookCall = fetchSpy.mock.calls.find(c => String(c[0]).includes('/webhook'));
    expect(webhookCall).toBeUndefined();

    fetchSpy.mockRestore();
  });
});
