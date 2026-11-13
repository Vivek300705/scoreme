import { logger } from '../../config/logger.js';

export function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || (err.name === 'IdempotencyConflictError' ? 409 : 500);
  const correlationId = req.headers['x-correlation-id'] || 'system';

  logger.error('Unhandled request exception', {
    correlationId,
    path: req.originalUrl,
    method: req.method,
    statusCode,
    error: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });

  res.status(statusCode).json({
    error: err.name || 'InternalServerError',
    message: err.message || 'An unexpected error occurred',
    statusCode,
    correlationId,
    timestamp: new Date().toISOString()
  });
}

