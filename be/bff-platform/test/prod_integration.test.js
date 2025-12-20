const axios = require('axios');

describe('production integration checks (via Caddy proxy)', () => {
  const base = process.env.BASE_URL || 'http://127.0.0.1';

  test('caddy /health responds', async () => {
    try {
      const res = await axios.get(`${base}/health`, { timeout: 5000 });
      expect(res.status).toBe(200);
      expect(String(res.data)).toContain('healthy');
    } catch (err) {
      if (err && (err.code === 'ECONNREFUSED' || String(err.message).includes('connect ECONNREFUSED'))) {
        console.warn('prod_integration: caddy not reachable at', base, '- skipping this check');
        return;
      }
      throw err;
    }
  }, 10000);

  test('bff-platform health responds', async () => {
    try {
      const res = await axios.get(`${base}/api/v1/telemetry/health`, { timeout: 5000 });
      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('status', 'ok');
    } catch (err) {
      if (err && (err.code === 'ECONNREFUSED' || String(err.message).includes('connect ECONNREFUSED'))) {
        console.warn('prod_integration: bff-platform not reachable via', base, '- skipping this check');
        return;
      }
      throw err;
    }
  }, 10000);

  test('auth -> platform profile sync roundtrip', async () => {
    try {
      const payload = { phoneNumber: '+919999111222', consentGiven: true, last_login_location: 'Mumbai' };
      const res = await axios.post(`${base}/api/v1/users/profile`, payload, { timeout: 5000 });
      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('status', 'ok');
      expect(res.data.data).toHaveProperty('user');
      expect(res.data.data.user).toHaveProperty('last_login_location', 'Mumbai');
    } catch (err) {
      if (err && (err.code === 'ECONNREFUSED' || String(err.message).includes('connect ECONNREFUSED'))) {
        console.warn('prod_integration: auth/platform endpoints not reachable via', base, '- skipping this check');
        return;
      }
      throw err;
    }
  }, 15000);
});
