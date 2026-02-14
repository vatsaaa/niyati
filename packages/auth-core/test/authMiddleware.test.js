// @niyati/auth-core — authMiddleware tests
const jwt = require('jsonwebtoken');

describe('createAuthMiddleware', () => {
  const SECRET = 'test-secret-that-is-long-enough';
  const verifyToken = (token) => jwt.verify(token, SECRET, { algorithms: ['HS256'] });
  const errorCodes = { UNAUTHORIZED: 'UNAUTHORIZED', FORBIDDEN: 'FORBIDDEN', INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR' };

  test('authenticate returns 401 when no token', () => {
    const { createAuthMiddleware } = require('../lib/authMiddleware');
    const { authenticate } = createAuthMiddleware({ verifyToken, errorCodes });
    const req = { headers: {} };
    const res = { sendError: jest.fn() };
    const next = jest.fn();
    authenticate(req, res, next);
    expect(res.sendError).toHaveBeenCalledWith('UNAUTHORIZED', expect.any(String));
    expect(next).not.toHaveBeenCalled();
  });

  test('authenticate sets req.user on valid token', () => {
    const { createAuthMiddleware } = require('../lib/authMiddleware');
    const { authenticate } = createAuthMiddleware({ verifyToken, errorCodes });
    const token = jwt.sign({ sub: 42, roles: ['user'] }, SECRET, { algorithm: 'HS256' });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = { sendError: jest.fn() };
    const next = jest.fn();
    authenticate(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user).toBeDefined();
    expect(req.user.id).toBe(42);
  });

  test('authenticate returns 401 on expired token', () => {
    const { createAuthMiddleware } = require('../lib/authMiddleware');
    const { authenticate } = createAuthMiddleware({ verifyToken, errorCodes });
    const token = jwt.sign({ sub: 1 }, SECRET, { algorithm: 'HS256', expiresIn: -10 });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = { sendError: jest.fn() };
    const next = jest.fn();
    authenticate(req, res, next);
    expect(res.sendError).toHaveBeenCalledWith('UNAUTHORIZED', 'Token expired');
    expect(next).not.toHaveBeenCalled();
  });

  test('requireRole rejects when role missing', () => {
    const { createAuthMiddleware } = require('../lib/authMiddleware');
    const { requireRole } = createAuthMiddleware({ verifyToken, errorCodes });
    const handler = requireRole('admin');
    const req = { user: { id: 1, roles: ['user'] } };
    const res = { sendError: jest.fn() };
    const next = jest.fn();
    handler(req, res, next);
    expect(res.sendError).toHaveBeenCalledWith('FORBIDDEN', expect.any(String));
    expect(next).not.toHaveBeenCalled();
  });

  test('requireRole passes when role present', () => {
    const { createAuthMiddleware } = require('../lib/authMiddleware');
    const { requireRole } = createAuthMiddleware({ verifyToken, errorCodes });
    const handler = requireRole('admin');
    const req = { user: { id: 1, roles: ['admin'] } };
    const res = { sendError: jest.fn() };
    const next = jest.fn();
    handler(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});
