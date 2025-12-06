const jwt = require('jsonwebtoken');
const config = require('../../config');
const { ErrorCodes } = require('./responses');

function authenticate(req, res, next) {
  const auth = req.headers.authorization || '';
  let token;
  if (auth.startsWith('Bearer ')) token = auth.slice(7);
  if (!token) return res.sendError(ErrorCodes.UNAUTHORIZED, 'Missing access token');

  const secret = process.env.ACCESS_TOKEN_SECRET || 'dev-secret';
  try {
    const payload = jwt.verify(token, secret);
    req.user = { id: payload.sub, ...payload };
    return next();
  } catch (err) {
    return res.sendError(ErrorCodes.UNAUTHORIZED, 'Invalid access token');
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) return res.sendError(ErrorCodes.UNAUTHORIZED, 'Missing authentication');
    const roles = req.user.roles || [];
    if (!roles.includes(role)) return res.sendError(ErrorCodes.FORBIDDEN, 'Insufficient role');
    return next();
  };
}

module.exports = { authenticate, requireRole };
