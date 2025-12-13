import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginForm from '../LoginForm';

describe('LoginForm identify flow', () => {
  const countries = [{ code: 'IN', name: 'India', dialCode: '+91', flag: '🇮🇳', phoneLength: 10 }];
  const selectedCountry = countries[0];

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('calls onLogin with identified user when identify returns returning:true', async () => {
    const mockUser = { id: '1', phone_number: '+91-9999999999' };
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'ok', data: { returning: true, user: mockUser } }) });

    const onLogin = vi.fn();
    render(
      <LoginForm
        onLogin={onLogin}
        countries={countries}
        selectedCountry={selectedCountry}
        setSelectedCountry={() => {}}
        consentChecked={true}
        setConsentChecked={() => {}}
        onShowPrivacy={() => {}}
      />
    );

    const input = screen.getByPlaceholderText(`${selectedCountry.phoneLength}-digit number`);
    await userEvent.type(input, '9999999999');
    const btn = screen.getByRole('button', { name: /Begin Your Journey/i });
    await userEvent.click(btn);

    await waitFor(() => expect(onLogin).toHaveBeenCalled());
    expect(onLogin.mock.calls[0][2]).toEqual(mockUser);
  });

  test('calls onLogin with null when identify returns returning:false', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'ok', data: null }) });

    const onLogin = vi.fn();
    render(
      <LoginForm
        onLogin={onLogin}
        countries={countries}
        selectedCountry={selectedCountry}
        setSelectedCountry={() => {}}
        consentChecked={true}
        setConsentChecked={() => {}}
        onShowPrivacy={() => {}}
      />
    );

    const input = screen.getByPlaceholderText(`${selectedCountry.phoneLength}-digit number`);
    await userEvent.type(input, '8888888888');
    const btn = screen.getByRole('button', { name: /Begin Your Journey/i });
    await userEvent.click(btn);

    await waitFor(() => expect(onLogin).toHaveBeenCalled());
    expect(onLogin.mock.calls[0][2]).toBeNull();
  });
});
