import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { act } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock the registerSW module so we control update callback
vi.mock('../../utils/registerSW', () => ({
  onUpdateAvailable: (cb) => { // call later via exported trigger
    // store callback on window so tests can trigger
    window.__updateCb = cb;
  }
}));

import UpdateNotification from '../UpdateNotification';

describe('UpdateNotification', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete window.__updateCb;
    // ensure reload won't actually navigate by redefining location
    const origLocation = window.location;
    Object.defineProperty(window, 'location', {
      value: { reload: vi.fn(), port: '' },
      configurable: true
    });
    // restore after test run via global cleanup isn't necessary in vitest local ephemeral env
  });

  it('does not render initially', () => {
    render(React.createElement(UpdateNotification));
    expect(screen.queryByText(/Update Available/)).toBeNull();
  });

  it('shows notification when update callback invoked and handles actions', async () => {
    render(React.createElement(UpdateNotification));
    // trigger the update callback
    expect(typeof window.__updateCb).toBe('function');
    window.__updateCb();

    // now the notification should appear
    expect(await screen.findByText('Update Available')).toBeTruthy();
    const refreshBtn = screen.getByText('Refresh');
    const dismissBtn = screen.getByLabelText('Dismiss');

    // click refresh should call reload
    fireEvent.click(refreshBtn);
    expect(window.location.reload).toHaveBeenCalled();

    // click dismiss should hide the notification
    window.__updateCb(); // show again
    fireEvent.click(dismissBtn);
    expect(screen.queryByText('Update Available')).toBeNull();
  });
});
