import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LoginForm from '../LoginForm';

const INDIA = { code: 'IN', name: 'India', dialCode: '+91', phoneLength: 10, flag: '🇮🇳' };
const countries = [INDIA];

function renderForm(overrides = {}) {
  const defaults = {
    onLogin: vi.fn(),
    countries,
    selectedCountry: INDIA,
    setSelectedCountry: vi.fn(),
    consentChecked: false,
    setConsentChecked: vi.fn(),
    onShowPrivacy: vi.fn()
  };
  return render(<LoginForm {...defaults} {...overrides} />);
}

describe('LoginForm inline error handling', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Ensure no alert() calls leak through
    vi.spyOn(window, 'alert').mockImplementation(() => {});
  });

  test('shows inline error for invalid phone number on submit', async () => {
    renderForm({ consentChecked: true });

    // Type a short phone number (less than 10 digits)
    const phoneInput = screen.getByPlaceholderText(/digit number/i);
    fireEvent.change(phoneInput, { target: { value: '12345' } });

    // The submit button should be disabled, but let's also verify no alert is used
    // Try submitting the form directly
    const form = phoneInput.closest('form');
    fireEvent.submit(form);

    // Should show inline error, NOT call alert()
    await waitFor(() => {
      const errorEl = screen.queryByText(/valid.*phone/i) || screen.queryByText(/digit.*phone/i);
      expect(errorEl).toBeTruthy();
    });
    expect(window.alert).not.toHaveBeenCalled();
  });

  test('shows inline error when privacy policy not accepted', async () => {
    renderForm({ consentChecked: false });

    const phoneInput = screen.getByPlaceholderText(/digit number/i);
    fireEvent.change(phoneInput, { target: { value: '9899162012' } });

    const form = phoneInput.closest('form');
    fireEvent.submit(form);

    await waitFor(() => {
      const errorEl = screen.queryByText(/accept the privacy/i);
      expect(errorEl).toBeTruthy();
    });
    expect(window.alert).not.toHaveBeenCalled();
  });

  test('shows network error with retry option on API failure', async () => {
    global.fetch = vi.fn().mockRejectedValueOnce(new Error('Network error'));

    renderForm({ consentChecked: true });

    const phoneInput = screen.getByPlaceholderText(/digit number/i);
    fireEvent.change(phoneInput, { target: { value: '9899162012' } });

    const form = phoneInput.closest('form');
    fireEvent.submit(form);

    await waitFor(() => {
      const errorEl = screen.queryByText(/connection|internet|try again/i);
      expect(errorEl).toBeTruthy();
    });
  });

  test('clears error when user starts typing', async () => {
    renderForm({ consentChecked: true });

    const phoneInput = screen.getByPlaceholderText(/digit number/i);
    fireEvent.change(phoneInput, { target: { value: '123' } });

    // Submit to trigger error
    const form = phoneInput.closest('form');
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.queryByText(/valid.*phone|digit.*phone/i)).toBeTruthy();
    });

    // Start typing again — error should clear
    fireEvent.change(phoneInput, { target: { value: '1234' } });

    await waitFor(() => {
      expect(screen.queryByText(/valid.*phone|digit.*phone/i)).toBeFalsy();
    });
  });

  test('phone input gets red border on validation error', async () => {
    renderForm({ consentChecked: true });

    const phoneInput = screen.getByPlaceholderText(/digit number/i);
    fireEvent.change(phoneInput, { target: { value: '123' } });

    const form = phoneInput.closest('form');
    fireEvent.submit(form);

    await waitFor(() => {
      expect(phoneInput.className).toMatch(/border-red|ring-red/);
    });
  });

  test('consent checkbox area gets red styling when not accepted', async () => {
    renderForm({ consentChecked: false });

    const phoneInput = screen.getByPlaceholderText(/digit number/i);
    fireEvent.change(phoneInput, { target: { value: '9899162012' } });

    const form = phoneInput.closest('form');
    fireEvent.submit(form);

    await waitFor(() => {
      const errorEl = screen.queryByText(/accept the privacy/i);
      expect(errorEl).toBeTruthy();
      expect(errorEl.className).toMatch(/red/);
    });
  });
});
