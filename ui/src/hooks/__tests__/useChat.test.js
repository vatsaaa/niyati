import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import React, { useRef, forwardRef, useImperativeHandle } from 'react';
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

describe('useChat', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('does nothing for empty input', async () => {
    const profile = {};
    const updateProfile = vi.fn();
    const addMessage = vi.fn();
    const auth = { countries: [{ code: 'US', name: 'United States', dialCode: '+1' }], phoneNumber: '+1-111' };

    const ref = React.createRef();
    render(React.createElement(Harness, { ref, profile, updateProfile, addMessage, auth }));
    await act(async () => {
      await ref.current.handleSend('   ', () => {});
    });
    expect(addMessage).not.toHaveBeenCalled();
  });

  it('asks for missing fields when profile incomplete', async () => {
    const profile = {};
    const updateProfile = vi.fn();
    const addMessage = vi.fn();
    const auth = { countries: [{ code: 'US', name: 'United States', dialCode: '+1' }], phoneNumber: '+1-111' };

    const ref = React.createRef();
    render(React.createElement(Harness, { ref, profile, updateProfile, addMessage, auth }));
    await act(async () => {
      await ref.current.handleSend('hello', () => {});
    });
    // first call is the user's message, second call should be bot question
    expect(addMessage.mock.calls.length).toBeGreaterThanOrEqual(2);
    const botCall = addMessage.mock.calls[1][0];
    expect(botCall.sender).toBe('bot');
    expect(botCall.text).toMatch(/Could you tell me/);
  });
});
