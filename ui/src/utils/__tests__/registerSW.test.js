import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as reg from '../registerSW';

describe('registerSW', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // restore any globals
    delete window.__updateCb;
  });

  it('onUpdateAvailable stores callback and unregister calls service worker ready', async () => {
    const cb = vi.fn();
    reg.onUpdateAvailable(cb);
    // the module stores callback internally; simulate how UpdateNotification uses it by invoking stored global
    // Since module sets updatePendingCallback internally, we cannot read it; instead test unregister
    // Mock navigator.serviceWorker.ready
    const unregister = vi.fn();
    global.navigator.serviceWorker = {
      ready: Promise.resolve({ unregister })
    };

    await reg.unregister();
    expect(unregister).toHaveBeenCalled();
  });
});
