import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { act } from 'react';
import { render, screen } from '@testing-library/react';

describe('NetworkStatus', () => {
  it('shows banner when offline', async () => {
    // mock hook to return offline
    vi.resetModules();
    vi.doMock('../../hooks/usePWA', () => ({ useOnlineStatus: () => false }));
    const mod = await import('../NetworkStatus');
    const Net = mod.default;
    render(Net());
    expect(screen.getByText(/You're offline/)).toBeTruthy();
  });

  it('does not render when online', async () => {
    // ensure clean DOM and mock to return online
    document.body.innerHTML = '';
    vi.resetModules();
    vi.doMock('../../hooks/usePWA', () => ({ useOnlineStatus: () => true }));
    const mod = await import('../NetworkStatus');
    const Net = mod.default;
    const { queryByText } = render(Net());
    expect(queryByText(/You're offline/)).toBeNull();
  });
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.resetAllMocks();
});
