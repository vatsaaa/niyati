/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import React, { forwardRef, useImperativeHandle } from 'react';
import { act } from 'react';

vi.mock('../../utils/profileExtractor', () => ({ extractProfileFields: vi.fn(async () => ({})) }));
vi.mock('../../services/geo', () => ({ resolveLocationAndTimezone: vi.fn() }));
vi.mock('../../services/api', () => ({ bffFetchWithRetry: vi.fn(), sendClientLog: vi.fn() }));
vi.mock('../../config', () => ({ N8N_WEBHOOK_URL: 'https://n8n.test/webhook', N8N_WEBHOOK_FALLBACK_URL: '' }));

import { useChat } from '../useChat';

function HookHarness({ profile, updateProfile, addMessage, auth }, ref) {
  const { handleSend, isLoading } = useChat(profile, updateProfile, addMessage, auth);
  useImperativeHandle(ref, () => ({ handleSend, isLoading }));
  return null;
}

const Harness = forwardRef(HookHarness);

describe('useChat profile locking', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Clear localStorage before each test
    try {
      localStorage.clear();
    } catch (e) {
      // ignore
    }
  });

  afterEach(() => {
    try {
      localStorage.clear();
    } catch (e) {
      // ignore
    }
  });

  it('blocks profile update attempts when profile is locked', async () => {
    // Mark profile as already sent (locked)
    localStorage.setItem('niyati_profile_sent', 'true');
    
    const profile = {
      user_name: 'Ankur',
      user_dob: '1990-05-19',
      user_placeOfBirth: 'Mumbai',
      user_timeOfBirth: '08:30',
      user_consentGiven: true,
      user_verified: { id: 'test-id' }
    };
    const updateProfile = vi.fn();
    const addMessage = vi.fn();
    const auth = { 
      countries: [{ code: 'IN', name: 'India', dialCode: '+91' }], 
      phoneNumber: '+91-9876543210' 
    };

    const ref = React.createRef();
    render(React.createElement(Harness, { ref, profile, updateProfile, addMessage, auth }));
    
    // Try to update profile via chat
    await act(async () => {
      await ref.current.handleSend('Actually my name is Rahul, please update it', () => {});
    });
    
    // Should have user message and bot rejection message
    expect(addMessage.mock.calls.length).toBeGreaterThanOrEqual(2);
    const botMessage = addMessage.mock.calls.find(call => call[0].sender === 'bot');
    expect(botMessage).toBeTruthy();
    expect(botMessage[0].text).toMatch(/edit|double-click|to edit/i);
  });

  it('allows profile extraction when profile is not locked', async () => {
    // Ensure profile is NOT locked
    localStorage.removeItem('niyati_profile_sent');
    
    const { extractProfileFields } = await import('../../utils/profileExtractor');
    extractProfileFields.mockResolvedValueOnce({ name: 'Rahul' });
    
    const profile = { user_consentGiven: true };
    const updateProfile = vi.fn();
    const addMessage = vi.fn();
    const auth = { 
      countries: [{ code: 'IN', name: 'India', dialCode: '+91' }], 
      phoneNumber: '+91-9876543210' 
    };

    const ref = React.createRef();
    render(React.createElement(Harness, { ref, profile, updateProfile, addMessage, auth }));
    
    await act(async () => {
      await ref.current.handleSend('My name is Rahul', () => {});
    });
    
    // Should call updateProfile to update the name
    expect(updateProfile).toHaveBeenCalled();
    const lastUpdateCall = updateProfile.mock.calls[updateProfile.mock.calls.length - 1][0];
    expect(lastUpdateCall.user_name).toBe('Rahul');
  });

  it('detects various profile update attempt patterns', async () => {
    localStorage.setItem('niyati_profile_sent', 'true');
    
    const profile = {
      user_name: 'Ankur',
      user_dob: '1990-05-19',
      user_placeOfBirth: 'Mumbai',
      user_timeOfBirth: '08:30',
      user_consentGiven: true,
      user_verified: { id: 'test-id' }
    };
    const updateProfile = vi.fn();
    const auth = { 
      countries: [{ code: 'IN', name: 'India', dialCode: '+91' }], 
      phoneNumber: '+91-9876543210' 
    };

    // Test update attempts that should be blocked
    const updateAttempts = [
      'Change my name to Rahul',
      'My dob is wrong, it should be 1992-03-15',
      'I was actually born in Delhi'
    ];

    for (const attempt of updateAttempts) {
      const addMessage = vi.fn();
      const ref = React.createRef();
      render(React.createElement(Harness, { ref, profile, updateProfile, addMessage, auth }));
      
      await act(async () => {
        await ref.current.handleSend(attempt, () => {});
      });
      
      const botMessage = addMessage.mock.calls.find(call => call[0].sender === 'bot');
      expect(botMessage).toBeTruthy();
      // The bot message should direct the user to edit the profile (phrase may vary)
      expect(botMessage[0].text).toMatch(/edit|double-click|to edit/i);
    }
  });
});

describe('useChat credit checks', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    try { localStorage.clear(); } catch (e) {}
  });

  afterEach(() => {
    try { localStorage.clear(); } catch (e) {}
  });

  it('blocks queries when credits exhausted', async () => {
    localStorage.setItem('niyati_profile_sent', 'true');
    localStorage.setItem('niyati_credits_config', JSON.stringify({
      credits_monthly_free: 10,
      credits_horoscope_cost: 2,
      credits_premium_cost: 4,
      credits_low_threshold: 4,
      payment_amount_inr: 500
    }));
    
    const profile = {
      user_name: 'Ankur',
      user_dob: '1990-05-19',
      user_placeOfBirth: 'Mumbai',
      user_timeOfBirth: '08:30',
      user_consentGiven: true,
      user_credits: 0, // No credits
      user_verified: { id: 'test-id' }
    };
    const updateProfile = vi.fn();
    const addMessage = vi.fn();
    const auth = { 
      countries: [{ code: 'IN', name: 'India', dialCode: '+91' }], 
      phoneNumber: '+91-9876543210' 
    };

    const ref = React.createRef();
    render(React.createElement(Harness, { ref, profile, updateProfile, addMessage, auth }));
    
    await act(async () => {
      await ref.current.handleSend("What's my horoscope today?", () => {});
    });
    
    // Should have rejection message about credits
    const botMessages = addMessage.mock.calls.filter(call => call[0].sender === 'bot');
    expect(botMessages.length).toBeGreaterThan(0);
    const creditMsg = botMessages.find(m => m[0].text.toLowerCase().includes('credit'));
    expect(creditMsg).toBeTruthy();
  });
});
