const request = require('supertest');
const app = require('../src/index');

describe('Global error handler', () => {
  test('returns structured error without leaking internals', async () => {
    // Attach a temporary route that uses the response helper directly
    app.get('/__test_senderror', (req, res) => {
      return res.sendError('INTERNAL_SERVER_ERROR', 'boom');
    });

    const res = await request(app).get('/__test_senderror').expect(500);

    expect(res.body).toHaveProperty('status', 'error');
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toHaveProperty('code', 'INTERNAL_SERVER_ERROR');
    expect(res.body.error).toHaveProperty('message', 'boom');
    // Ensure no raw stack or internal details leaked
    expect(res.body.error).not.toHaveProperty('stack');
  });
});
