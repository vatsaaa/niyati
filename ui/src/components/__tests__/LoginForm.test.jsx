import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginForm from '../LoginForm';
import { vi, describe, test, beforeEach, afterEach, beforeAll, afterAll, expect } from 'vitest';
import { JSDOM } from 'jsdom';

// Ensure a DOM environment for tests that rely on document/window
beforeAll(() => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
  global.window = dom.window;
  global.document = dom.window.document;
  Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true });
  global.localStorage = dom.window.localStorage;
  if (typeof global.window.matchMedia !== 'function') {
    Object.defineProperty(global.window, 'matchMedia', {
      value: (query) => ({ matches: false, media: query, addListener: () => {}, removeListener: () => {} }),
      configurable: true
    });
  }
  // Polyfill scrollIntoView and legacy attach/detach event helpers used by React DOM
  if (!global.window.HTMLElement.prototype.scrollIntoView) {
    global.window.HTMLElement.prototype.scrollIntoView = function() {};
  }
  if (!global.window.HTMLElement.prototype.attachEvent) {
    global.window.HTMLElement.prototype.attachEvent = function() {};
  }
  if (!global.window.HTMLElement.prototype.detachEvent) {
    global.window.HTMLElement.prototype.detachEvent = function() {};
  }
});

afterAll(() => {
  try {
    delete global.window;
    delete global.document;
    delete global.navigator;
    delete global.localStorage;
  } catch (e) {}
});

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
    const { container } = render(
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

    const input = within(container).getByPlaceholderText(`${selectedCountry.phoneLength}-digit number`);
    await userEvent.type(input, '9999999999');
    const btn = within(container).getByRole('button', { name: /Begin Your Journey/i });
    await userEvent.click(btn);

    await waitFor(() => expect(onLogin).toHaveBeenCalled());
    expect(onLogin.mock.calls[0][2]).toEqual(mockUser);
  });

  test('calls onLogin with null when identify returns returning:false', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'ok', data: null }) });

    const onLogin = vi.fn();
    const { container } = render(
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

    const input = within(container).getByPlaceholderText(`${selectedCountry.phoneLength}-digit number`);
    await userEvent.type(input, '8888888888');
    const btn = within(container).getByRole('button', { name: /Begin Your Journey/i });
    await userEvent.click(btn);

    await waitFor(() => expect(onLogin).toHaveBeenCalled());
    expect(onLogin.mock.calls[0][2]).toBeNull();
  });
});
