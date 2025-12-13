const request = require('supertest');
const express = require('express');

const commons = require('../../../commons');

describe('bff-platform - users lookup', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use(commons.attachResponseHelpers);

    // mount users router
    const usersRouter = require('../../lib/users');
    app.use('/api/users', usersRouter);
  });

  test('GET /api/users/lookup without identifier returns MISSING_REQUIRED_FIELD', async () => {
    const res = await request(app).get('/api/users/lookup');
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error.code).toBe(commons.ErrorCodes.MISSING_REQUIRED_FIELD);
  });

  test('GET /api/users/lookup returns ok with null when user not found', async () => {
    // Attach a mock db that returns no rows
    const mockDb = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    app.set('db', mockDb);

    const res = await request(app).get('/api/users/lookup').query({ phoneNumber: '+91-9999999999' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.data).toBeNull();
  });

  test('GET /api/users/lookup returns user when found', async () => {
    const sample = [{ id: '1', phone_number: '+91-9999999999', date_of_birth: '1990-01-01', place_of_birth: 'Pune', time_of_birth: '10:00', consent_given: true }];
    const mockDb = { query: jest.fn().mockResolvedValue({ rows: sample }) };
    app.set('db', mockDb);

    const res = await request(app).get('/api/users/lookup').query({ phoneNumber: '+91-9999999999' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.data).toHaveProperty('user');
    expect(res.body.data.user).toHaveProperty('phone_number', '+91-9999999999');

    // ensure the DB was queried with the phone param
    expect(mockDb.query).toHaveBeenCalled();
    const calledWith = mockDb.query.mock.calls[0];
    expect(calledWith[1]).toContain('+91-9999999999');
  });
});
