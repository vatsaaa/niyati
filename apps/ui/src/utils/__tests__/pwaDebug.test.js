import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as pwa from '../pwaDebug';

describe('pwaDebug basics', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // default userAgent
    Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)', configurable: true });
  });

  it('getPlatform returns macOS for Mac UA', () => {
    const plat = pwa.getPlatform();
    expect(plat).toBe('macOS');
  });

  it('getNetworkInfo returns structure', () => {
    // mock navigator.connection
    Object.defineProperty(navigator, 'connection', { value: { effectiveType: '4g', downlink: 10, rtt: 50, saveData: false }, configurable: true });
    const net = pwa.getNetworkInfo();
    expect(net).toHaveProperty('online');
    expect(net).toHaveProperty('type');
  });

  it('isAppInstalled returns expected shape', () => {
    // mock matchMedia
    window.matchMedia = () => ({ matches: true });
    Object.defineProperty(window.navigator, 'standalone', { value: false, configurable: true });
    const out = pwa.isAppInstalled();
    expect(out).toHaveProperty('installed');
    expect(out).toHaveProperty('platform');
  });
});
