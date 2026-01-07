const { handleJob } = require('../worker');
const axios = require('axios');

jest.mock('axios');

describe('worker handleJob webhook', () => {
  test('successful webhook returns true and logs', async () => {
    axios.mockResolvedValue({ status: 200, data: { ok: true } });
    const fakeRedis = { lPush: jest.fn() };
    const job = { type: 'webhook', data: { url: 'http://example.local/test', method: 'post', body: { hello: 'world' } } };
    const res = await handleJob(job, fakeRedis);
    expect(res).toBe(true);
    expect(fakeRedis.lPush).not.toHaveBeenCalled();
  });

  test('failed webhook requeues when attempts > 1', async () => {
    axios.mockRejectedValue(new Error('network'));
    const fakeRedis = { lPush: jest.fn().mockResolvedValue(true) };
    const job = { type: 'webhook', data: { url: 'http://example.local/fail', body: {} }, attempts: 2 };
    const res = await handleJob(job, fakeRedis);
    expect(res).toBe(false);
    expect(fakeRedis.lPush).toHaveBeenCalledWith('job_queue', expect.any(String));
    const pushed = JSON.parse(fakeRedis.lPush.mock.calls[0][1]);
    expect(pushed.attempts).toBe(1);
  });

  test('failed webhook moves to job_failed when attempts == 1', async () => {
    axios.mockRejectedValue(new Error('network'));
    const fakeRedis = { lPush: jest.fn().mockResolvedValue(true) };
    const job = { type: 'webhook', data: { url: 'http://example.local/fail', body: {} }, attempts: 1 };
    const res = await handleJob(job, fakeRedis);
    expect(res).toBe(false);
    expect(fakeRedis.lPush).toHaveBeenCalledWith('job_failed', expect.any(String));
  });
});
