// Standardized error response utilities
// Ensures consistent error format across all BFF endpoints

/**
 * Standard error response format:
 * {
 *   status: 'error',
 *   error: {
 *     code: 'ERROR_CODE',
 *     message: 'Human-readable error message',
 *     details?: any // Optional additional context
 *   },
 *   reqId?: string // Request ID for correlation
 * }
 */

/**
 * @typedef {import('express').Response} ExpressResponse
 * @typedef {import('express').Request} ExpressRequest
 * @typedef {import('express').NextFunction} NextFunction
 *
 * @typedef {Object} ResponseHelpersOptions
 * @property {string} [reqId]
 * @property {number} [statusCode]
 * @property {any} [details]
 *
 * @typedef {ExpressResponse & {
 *   sendError: (code: string, message: string, options?: ResponseHelpersOptions) => ExpressResponse,
 *   sendSuccess: (data: any, options?: { reqId?: string, meta?: any, statusCode?: number }) => ExpressResponse
 * }} ExpressResponseWithHelpers
 */

// Error codes enum for consistency
const ErrorCodes = {
  // Client errors (4xx)
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  INVALID_INPUT: 'INVALID_INPUT',

  // Server errors (5xx)
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  GATEWAY_TIMEOUT: 'GATEWAY_TIMEOUT',
  PROVIDER_ERROR: 'PROVIDER_ERROR',

  // Business logic errors
  NO_RESULTS: 'NO_RESULTS',
  CONFLICT: 'CONFLICT',
  AMBIGUOUS_RESULTS: 'AMBIGUOUS_RESULTS',

  // Domain-specific: Authentication
  AUTH_INVALID_PHONE: 'AUTH_001',
  AUTH_SESSION_EXPIRED: 'AUTH_002',

  // Domain-specific: Profile
  PROFILE_MISSING_FIELDS: 'PROFILE_001',
  PROFILE_INVALID_DOB: 'PROFILE_002',
  PROFILE_UNDERAGE: 'PROFILE_003',

  // Domain-specific: Credits
  INSUFFICIENT_CREDITS: 'CREDIT_001',
  CREDIT_DEDUCTION_FAILED: 'CREDIT_002',

  // Domain-specific: Payments
  PAYMENT_INVALID_UPI: 'PAYMENT_001',
  PAYMENT_INVALID_TXN_ID: 'PAYMENT_002',
  PAYMENT_VERIFICATION_TIMEOUT: 'PAYMENT_003',
  PAYMENT_AMOUNT_MISMATCH: 'PAYMENT_004',
  PAYMENT_DUPLICATE_TXN: 'PAYMENT_005',

  // Domain-specific: AI
  AI_RESPONSE_TIMEOUT: 'AI_001',
  AI_SERVICE_UNAVAILABLE: 'AI_002'
};

// HTTP status code mapping
const ErrorStatusCodes = {
  [ErrorCodes.BAD_REQUEST]: 400,
  [ErrorCodes.UNAUTHORIZED]: 401,
  [ErrorCodes.FORBIDDEN]: 403,
  [ErrorCodes.NOT_FOUND]: 404,
  [ErrorCodes.METHOD_NOT_ALLOWED]: 405,
  [ErrorCodes.RATE_LIMIT_EXCEEDED]: 429,
  [ErrorCodes.VALIDATION_ERROR]: 400,
  [ErrorCodes.MISSING_REQUIRED_FIELD]: 400,
  [ErrorCodes.INVALID_INPUT]: 400,

  [ErrorCodes.INTERNAL_SERVER_ERROR]: 500,
  [ErrorCodes.SERVICE_UNAVAILABLE]: 503,
  [ErrorCodes.GATEWAY_TIMEOUT]: 504,
  [ErrorCodes.PROVIDER_ERROR]: 502,

  [ErrorCodes.NO_RESULTS]: 404,
  [ErrorCodes.AMBIGUOUS_RESULTS]: 200 // Still successful, just needs disambiguation
  ,
  [ErrorCodes.CONFLICT]: 409,

  // Domain-specific codes
  [ErrorCodes.AUTH_INVALID_PHONE]: 400,
  [ErrorCodes.AUTH_SESSION_EXPIRED]: 401,
  [ErrorCodes.PROFILE_MISSING_FIELDS]: 400,
  [ErrorCodes.PROFILE_INVALID_DOB]: 400,
  [ErrorCodes.PROFILE_UNDERAGE]: 403,
  [ErrorCodes.INSUFFICIENT_CREDITS]: 402,
  [ErrorCodes.CREDIT_DEDUCTION_FAILED]: 500,
  [ErrorCodes.PAYMENT_INVALID_UPI]: 400,
  [ErrorCodes.PAYMENT_INVALID_TXN_ID]: 400,
  [ErrorCodes.PAYMENT_VERIFICATION_TIMEOUT]: 504,
  [ErrorCodes.PAYMENT_AMOUNT_MISMATCH]: 400,
  [ErrorCodes.PAYMENT_DUPLICATE_TXN]: 409,
  [ErrorCodes.AI_RESPONSE_TIMEOUT]: 504,
  [ErrorCodes.AI_SERVICE_UNAVAILABLE]: 503
};

// Note: prefer using canonical ErrorCodes constants throughout the codebase.
// Remove legacy lowercase mappings to enforce consistent usage.


/**
 * Create a standardized error response
 * @param {string} code - Error code from ErrorCodes enum
 * @param {string} message - Human-readable error message
 * @param {object} options - Additional options { details, reqId, statusCode }
 * @returns {object} Standardized error response
 */
function createErrorResponse(code, message, options = {}) {
  // Input validation
  if (!code || typeof code !== 'string') {
    code = ErrorCodes.INTERNAL_SERVER_ERROR;
  }
  if (!message || typeof message !== 'string') {
    message = 'An error occurred';
  }
  if (!options || typeof options !== 'object') {
    options = {};
  }
  
  const { details, reqId, statusCode } = options;

  return {
    status: 'error',
    error: {
      code,
      message,
      ...(details && { details })
    },
    ...(reqId && { reqId })
  };
}

/**
 * Send a standardized error response
 * @param {object} res - Express response object
 * @param {string} code - Error code from ErrorCodes enum
 * @param {string} message - Human-readable error message
 * @param {object} options - Additional options { details, reqId, statusCode }
 */
function sendError(res, code, message, options = {}) {
  const { reqId, statusCode } = options;
  const httpStatus = statusCode || ErrorStatusCodes[code] || 500;

  const errorResponse = createErrorResponse(code, message, options);

  return res.status(httpStatus).json(errorResponse);
}

/**
 * Create a standardized success response
 * @param {object} data - Response data
 * @param {object} options - Additional options { reqId, meta }
 * @returns {object} Standardized success response
 */
function createSuccessResponse(data, options = {}) {
  const { reqId, meta } = options;

  return {
    status: 'ok',
    data,
    ...(meta && { meta }),
    ...(reqId && { reqId })
  };
}

/**
 * Send a standardized success response
 * @param {object} res - Express response object
 * @param {object} data - Response data
 * @param {object} options - Additional options { reqId, meta, statusCode }
 */
function sendSuccess(res, data, options = {}) {
  const { statusCode = 200 } = options;

  const successResponse = createSuccessResponse(data, options);

  return res.status(statusCode).json(successResponse);
}

/**
 * Middleware to extract request ID and attach helper methods to response
 */
function attachResponseHelpers(req, res, next) {
  const reqId = req._niyati_reqId;

  // Attach convenience methods to response object
  /**
   * Send a standardized error response
   * @param {string} code
   * @param {string} message
   * @param {ResponseHelpersOptions} [options]
   * @returns {ExpressResponse}
   */
  res.sendError = (code, message, options = {}) => {
    return sendError(res, code, message, { ...options, reqId });
  };

  /**
   * Send a standardized success response
   * @param {any} data
   * @param {{ reqId?: string, meta?: any, statusCode?: number }} [options]
   * @returns {ExpressResponse}
   */
  res.sendSuccess = (data, options = {}) => {
    return sendSuccess(res, data, { ...options, reqId });
  };

  next();
}

module.exports = {
  ErrorCodes,
  ErrorStatusCodes,
  createErrorResponse,
  sendError,
  createSuccessResponse,
  sendSuccess,
  attachResponseHelpers
};
