import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, test, beforeEach, afterEach, expect } from 'vitest';
import { JSDOM } from 'jsdom';

// Basic test: when the user sends "I was born in New Delhi", the app should
// call the geocoding flow and update localStorage `niyati_user_profile.user_placeOfBirth`.

describe('Place resolution', () => {
  beforeEach(() => {
    // Create a JSDOM environment and expose window/document/localStorage
    const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
    global.window = dom.window;
    global.document = dom.window.document;
    global.navigator = dom.window.navigator;
    // Use the real JSDOM localStorage
    global.localStorage = dom.window.localStorage;
    // Ensure a hostname consistent with the app's environment check
    global.window.location.hostname = 'localhost';

    // Provide an initial (consent true) profile so UI shows chat
    localStorage.setItem('niyati_user_profile', JSON.stringify({ user_name: '', user_dob: '', user_placeOfBirth: '', user_timeOfBirth: '', user_currentLocation: '', user_verified: {}, user_consentGiven: true }));

    // Mock global fetch to handle multiple endpoints
    global.fetch = vi.fn((url, opts) => {
      // Geocode endpoints
      if (typeof url === 'string' && url.includes('/api/geocode')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: 'ok', place: { city: 'New Delhi', state: 'Delhi', country: 'India', lat: 28.6139, lon: 77.2090, display_name: 'New Delhi, Delhi, India' } })
        });
      }
      // Timezone lookup
      if (typeof url === 'string' && url.includes('/api/astrology/geo-details')) {
        return Promise.resolve({ ok: true, json: async () => ({ status: 'ok', data: { timezone: 5.5 } }) });
      }
      // N8N webhook or other calls - return simple bot response
      return Promise.resolve({ ok: true, json: async () => ({ output: 'ok' }) });
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
    // Clean up globals created by JSDOM
    try {
      delete global.window;
      delete global.document;
      delete global.navigator;
      delete global.localStorage;
    } catch (e) {}
  });

  test('resolves extracted place and updates profile', async () => {
    // Import the app after setting up `window` and fetch mocks so module evaluation succeeds
    const { default: NiyatiChat } = await import('../App.jsx');
    render(<NiyatiChat />);

    // Find input field and send message
    const input = screen.getByPlaceholderText(/Ask something.../i);
    await userEvent.type(input, 'I was born in New Delhi');

    // Submit by pressing Enter to trigger the form submit
    await userEvent.keyboard('{Enter}');

    // Wait for background resolution to update localStorage
    await waitFor(() => {
      const raw = localStorage.getItem('niyati_user_profile');
      expect(raw).toBeTruthy();
      const profile = JSON.parse(raw);
      expect(profile.user_placeOfBirth).toBeTruthy();
      // Expect formatted place to include city, state, country
      expect(profile.user_placeOfBirth).toMatch(/New Delhi/i);
      expect(profile.user_placeOfBirth).toMatch(/Delhi/i);
      expect(profile.user_placeOfBirth).toMatch(/India/i);
    }, { timeout: 5000 });
  });
});
