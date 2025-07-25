import logger from './logger.js';

/**
 * Custom error classes for better error handling
 */
export class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message) {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication failed') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Rate limit exceeded') {
    super(message, 429, 'RATE_LIMIT_ERROR');
  }
}

/**
 * Express error handling middleware
 */
export function errorHandler(err, req, res, next) {
  // Log error
  logger.error({
    error: err,
    request: {
      method: req.method,
      url: req.url,
      params: req.params,
      query: req.query,
      body: req.body
    }
  });

  // Default error response
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error';
  let code = err.code || 'INTERNAL_ERROR';

  // Handle specific error types
  if (err.name === 'ValidationError') {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
  } else if (err.name === 'CastError') {
    statusCode = 400;
    message = 'Invalid ID format';
    code = 'INVALID_ID';
  } else if (err.code === 11000) {
    statusCode = 409;
    message = 'Duplicate entry';
    code = 'DUPLICATE_ERROR';
  }

  // Send error response
  res.status(statusCode).json({
    error: {
      message,
      code,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    }
  });
}

/**
 * Async error wrapper for route handlers
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Handle 404 errors
 */
export function notFoundHandler(req, res) {
  res.status(404).json({
    error: {
      message: `Cannot ${req.method} ${req.path}`,
      code: 'NOT_FOUND'
    }
  });
}