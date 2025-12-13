// Create a JSDOM environment early so imports relying on DOM won't fail
import { JSDOM } from 'jsdom';
const _dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
global.window = _dom.window;
global.document = _dom.window.document;
Object.defineProperty(global, 'navigator', { value: _dom.window.navigator, configurable: true });
global.localStorage = _dom.window.localStorage;
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

import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, test, beforeEach, afterEach, expect } from 'vitest';

// Basic test: when the user sends "I was born in New Delhi", the app should
// call the geocoding flow and update localStorage `niyati_user_profile.user_placeOfBirth`.

describe('Place resolution', () => {
  beforeEach(() => {
    // Create a JSDOM environment and expose window/document/localStorage
    const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
    global.window = dom.window;
    global.document = dom.window.document;
    // `navigator` can be a getter on some Node/JSDOM environments — define it safely
    Object.defineProperty(global, 'navigator', {
      value: dom.window.navigator,
      configurable: true,
      enumerable: false,
      writable: false
    });
    // Provide a basic matchMedia implementation for tests
    if (typeof global.window.matchMedia !== 'function') {
      Object.defineProperty(global.window, 'matchMedia', {
        value: (query) => ({ matches: false, media: query, addListener: () => {}, removeListener: () => {} }),
        configurable: true
      });
    }
    // Use the real JSDOM localStorage
    global.localStorage = dom.window.localStorage;
    // Ensure a hostname consistent with the app's environment check
    global.window.location.hostname = 'localhost';

    // Ensure required DOM polyfills are present on this new window instance
    if (!global.window.HTMLElement.prototype.scrollIntoView) {
      global.window.HTMLElement.prototype.scrollIntoView = function() {};
    }
    if (!global.window.HTMLElement.prototype.attachEvent) {
      global.window.HTMLElement.prototype.attachEvent = function() {};
    }
    if (!global.window.HTMLElement.prototype.detachEvent) {
      global.window.HTMLElement.prototype.detachEvent = function() {};
    }

    // Provide an initial (consent true) profile and mark user as logged-in so UI shows chat
    localStorage.setItem('niyati_user_profile', JSON.stringify({ user_name: '', user_dob: '', user_placeOfBirth: '', user_timeOfBirth: '', user_currentLocation: '', user_verified: {}, user_consentGiven: true }));
    localStorage.setItem('niyati_user_phone_number', '+91-9999999999');
    localStorage.setItem('niyati_user_country_code', 'IN');

    // Helper to create a Response-like object that closely mimics Fetch Response
    const makeResponse = (payload, status = 200, contentType = 'application/json') => {
      const bodyText = JSON.stringify(payload);
      const headers = new Map([['content-type', contentType]]);
      return {
        ok: status >= 200 && status < 300,
        status,
        statusText: String(status),
        headers: { get: (k) => headers.get(k.toLowerCase()) || null },
        json: async () => JSON.parse(bodyText),
        text: async () => bodyText,
        clone: function() { return makeResponse(payload, status, contentType); }
      };
    };

    // Mock global fetch to handle multiple endpoints and return Response-like objects
    global.fetch = vi.fn((url, opts) => {
      // Geocode endpoints (match any path containing 'geocode')
      if (typeof url === 'string' && url.includes('/geocode')) {
        const payload = { status: 'ok', place: { city: 'New Delhi', state: 'Delhi', country: 'India', lat: 28.6139, lon: 77.2090, display_name: 'New Delhi, Delhi, India' } };
        return Promise.resolve(makeResponse(payload, 200));
      }
      // Timezone lookup
      if (typeof url === 'string' && url.includes('/api/astrology/geo-details')) {
        return Promise.resolve(makeResponse({ status: 'ok', data: { timezone: 5.5 } }, 200));
      }
      // N8N webhook or other calls - return simple bot response
      return Promise.resolve(makeResponse({ output: 'ok' }, 200));
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
    const { container } = render(<NiyatiChat />);

    // Find input field and send message (scope queries to the rendered container)
    const input = within(container).getByPlaceholderText(/Ask something.../i);
    await userEvent.type(input, 'I was born in New Delhi');

    // Submit the form directly to avoid input polyfills in JSDOM
    const form = container.querySelector('form');
    if (form) {
      fireEvent.submit(form);
    } else {
      // Fallback to key events if form not found
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', charCode: 13 });
      fireEvent.keyUp(input, { key: 'Enter', code: 'Enter', charCode: 13 });
    }

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
    }, { timeout: 3000 });
  });
});
