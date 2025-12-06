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
  AMBIGUOUS_RESULTS: 'AMBIGUOUS_RESULTS'
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
  [ErrorCodes.CONFLICT]: 409
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
  res.sendError = (code, message, options = {}) => {
    return sendError(res, code, message, { ...options, reqId });
  };
  
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
