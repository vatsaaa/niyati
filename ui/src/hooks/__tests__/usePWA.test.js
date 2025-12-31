import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';
import { act } from 'react';

import { usePWA } from '../usePWA';

function Harness(props, ref) {
  const vals = usePWA();
  React.useImperativeHandle(ref, () => vals);
  return null;
}

const ForwardHarness = React.forwardRef(Harness);

describe('usePWA', () => {
  beforeEach(() => {
    // provide matchMedia shim for jsdom
    window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener: () => {}, removeListener: () => {} }));
    Object.defineProperty(document, 'referrer', { value: '', configurable: true });
    Object.defineProperty(window.navigator, 'standalone', { value: false, configurable: true });
  });

  it('reports unsupported when no beforeinstallprompt event', async () => {
    const ref = React.createRef();
    render(React.createElement(ForwardHarness, { ref }));
    // can install flag should be false initially
    expect(ref.current).toBeDefined();
    expect(ref.current.canInstall).toBe(false);
  });

  it('handles beforeinstallprompt and promptInstall', async () => {
    const userChoice = Promise.resolve({ outcome: 'accepted' });

    // create a fake beforeinstallprompt event
    const event = new Event('beforeinstallprompt');
    event.prompt = vi.fn();
    event.userChoice = userChoice;

    const ref = React.createRef();
    render(React.createElement(ForwardHarness, { ref }));

    // dispatch the event
    await act(async () => {
      window.dispatchEvent(event);
    });

    // now should be able to prompt
    const result = await ref.current.promptInstall();
    expect(result.outcome).toBe('accepted');
  });
});
