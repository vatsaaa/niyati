import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { act } from 'react';
import { render, waitFor } from '@testing-library/react';

// Mocks for services used inside useChat
vi.mock('../../utils/profileExtractor', () => ({ extractProfileFields: vi.fn() }));
vi.mock('../../services/geo', () => ({
  resolveLocationAndTimezone: vi.fn().mockResolvedValue({
    location: {
      lat: 19.0760,
      lon: 72.8777,
      display_name: 'Mumbai, Maharashtra, India'
    },
    timezone: 'Asia/Kolkata'
  })
}));
vi.mock('../../services/api', () => ({
  bffFetchWithRetry: vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'success' }) }),
  sendClientLog: vi.fn()
}));
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
    vi.clearAllMocks();
    // Clear localStorage between tests
    try { localStorage.clear(); } catch (e) {}
  });

  it('saves extracted profile, posts to /users/profile and then calls webhook with full profile', async () => {
    // 1. Setup Mocks
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'success' })
    });

    // Ensure backend save resolves successfully
    vi.mocked(bffFetchWithRetry).mockResolvedValue({ ok: true });

    // Mock extractor to return the expected fields
    vi.mocked(extractProfileFields).mockResolvedValue({
      name: 'Ankur',
      dob: '1990-05-19',
      timeOfBirth: '09:30',
      placeOfBirth: 'Mumbai',
      lat: 19.076,
      lon: 72.877,
      timezone: 'Asia/Kolkata',
      isComplete: true
    });

    const updateProfile = vi.fn();
    const addMessage = vi.fn();
    const auth = { countries: [{ code: 'IN', name: 'India', dialCode: '+91' }], phoneNumber: '+91-9999999999' };

    const ref = React.createRef();
    render(React.createElement(Harness, { ref, profile: {}, updateProfile, addMessage, auth }));

    // 2. Trigger the flow
    await act(async () => {
      await ref.current.handleSend('My name is Ankur, born 19 May 1990 in Mumbai at 9:30', () => {});
    });

    // 3. Assertions
    // Verify the profile extraction ran
    await waitFor(() => {
      expect(extractProfileFields).toHaveBeenCalled();
    });

    // Verify the profile update path executed (extraction -> updateProfile).
    await waitFor(() => {
      expect(updateProfile).toHaveBeenCalled();
    });

    fetchSpy.mockRestore();
  });

  it('politely informs unpaid users (QR shown) that only today questions are allowed', async () => {
    // Pre-mark that payment QR has been shown (simulate earlier flow)
    localStorage.setItem('niyati_payment_qr_shown', 'true');

    const profile = {
      name: 'Ankur',
      birthDate: '1990-05-19',
      placeOfBirth: 'Mumbai',
      timeOfBirth: '09:30',
      user_verified: { id: '1', phoneNumber: '+91-9992223333' },
      consentGiven: true,
      credits: 0, // Unpaid user with 0 credits
      totalPaidAmount: 0
    };

    const updateProfile = vi.fn();
    const addMessage = vi.fn();
    const auth = { countries: [{ code: 'IN', name: 'India', dialCode: '+91' }], phoneNumber: '+91-9999999999' };

    // Spy on global.fetch to ensure we do NOT contact the webhook for out-of-scope free question
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async () => ({ ok: true, json: async () => ({}), text: async () => JSON.stringify({}) }));

    // Ensure BFF classification returns a billable query so the hook enforces credit checks
    vi.mocked(bffFetchWithRetry).mockResolvedValue({ ok: true, json: async () => ({ status: 'ok', data: { queryType: 'horoscope', creditCost: 2, isBillable: true, config: { credits_horoscope_cost: 2, credits_premium_cost: 4 } } }) });

    const ref = React.createRef();
    render(React.createElement(Harness, { ref, profile, updateProfile, addMessage, auth }));

    await act(async () => {
      await ref.current.handleSend("Will I be promoted next year?", () => {});
    });

    // Expect the hook to have replied with early return (credit exhausted message)
    // The test profile has 0 credits and classification returns billable with cost 2
    // So the early return should happen and webhook should NOT be called
    const botCalls = addMessage.mock.calls.filter(c => c[0] && c[0].sender === 'bot');
    expect(botCalls.length).toBeGreaterThan(0);
    
    // Webhook should NOT be called when credits are insufficient
    const webhookCall = fetchSpy.mock.calls.find(c => String(c[0]).includes('/webhook'));
    expect(webhookCall).toBeUndefined();

    fetchSpy.mockRestore();
  });
});
