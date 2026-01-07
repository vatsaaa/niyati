/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the config to avoid VITE_N8N_WEBHOOK_URL validation error
vi.mock('../../config', () => ({
  N8N_WEBHOOK_URL: 'https://n8n.test/webhook',
  N8N_WEBHOOK_FALLBACK_URL: '',
  RETRY_CONFIG: { maxRetries: 3, baseDelayMs: 500 },
  buildApiUrl: (path) => `https://api${path}`
}));

describe('query classification and cost', () => {
  beforeEach(() => {
    // Set up localStorage with credits config
    localStorage.setItem('niyati_credits_config', JSON.stringify({
      credits_monthly_free: 10,
      credits_horoscope_cost: 2,
      credits_premium_cost: 4,
      credits_low_threshold: 4,
      payment_amount_inr: 500
    }));
  });

  it('identifies horoscope queries and assigns horoscope cost (via BFF)', async () => {
    const { classifyQuery } = await import('../useChat');
    const text = 'What is my horoscope for today?';

    // Stub fetch to simulate BFF classify response
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok', data: { queryType: 'horoscope', creditCost: 2, isBillable: true } })
    });

    const res = await classifyQuery(text);
    expect(res).toBeTruthy();
    expect(res.creditCost).toBe(2);
  });

  it('classifies non-horoscope as premium cost (via BFF)', async () => {
    const { classifyQuery } = await import('../useChat');
    const text = 'Will I get promoted in the next 6 months?';

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok', data: { queryType: 'premium', creditCost: 4, isBillable: true } })
    });

    const res = await classifyQuery(text);
    expect(res).toBeTruthy();
    expect(res.creditCost).toBe(4);
  });
});
