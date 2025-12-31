/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the config to avoid VITE_N8N_WEBHOOK_URL validation error
vi.mock('../../config', () => ({
  N8N_WEBHOOK_URL: 'https://n8n.test/webhook',
  N8N_WEBHOOK_FALLBACK_URL: '',
  RETRY_CONFIG: { maxRetries: 3, baseDelayMs: 500 }
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

  it('identifies horoscope queries and assigns horoscope cost', async () => {
    const useChatModule = await import('../useChat');
    const text = 'What is my horoscope for today?';
    const cost = useChatModule.getQueryCreditCost(text);
    expect(cost).toBeGreaterThan(0);
    // default config in getCreditsConfig uses credits_horoscope_cost = 2
    expect(cost).toBe(2);
  });

  it('classifies non-horoscope as premium cost', async () => {
    const useChatModule = await import('../useChat');
    const text = 'Will I get promoted in the next 6 months?';
    const cost = useChatModule.getQueryCreditCost(text);
    // default premium cost = 4
    expect(cost).toBe(4);
  });
});
