const jwt = require('jsonwebtoken');

describe('authMiddleware', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.ACCESS_TOKEN_SECRET = 'someverylongsecretvaluefor_tests_which_is_ok';
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('authenticate returns 401 when missing token', () => {
    const { authenticate } = require('../lib/authMiddleware');
    const req = { headers: {} };
    const res = { sendError: jest.fn() };
    const next = jest.fn();
    authenticate(req, res, next);
    expect(res.sendError).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  test('authenticate verifies token and sets req.user', () => {
    const { authenticate } = require('../lib/authMiddleware');
    const payload = { sub: 99, roles: ['user'] };
    const token = jwt.sign(payload, process.env.ACCESS_TOKEN_SECRET, { algorithm: 'HS256' });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = { sendError: jest.fn() };
    const next = jest.fn();
    authenticate(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user).toBeDefined();
    expect(req.user.id).toBe(99);
  });

  test('requireRole rejects when role missing', () => {
    const { requireRole } = require('../lib/authMiddleware');
    const handler = requireRole('admin');
    const req = { user: { id: 1, roles: ['user'] } };
    const res = { sendError: jest.fn() };
    const next = jest.fn();
    handler(req, res, next);
    expect(res.sendError).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });
});
