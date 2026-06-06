import { ApiError } from '../utils/api-error.js';

export function errorHandler(err, _req, res, _next) {
  const isValidationError = err?.name === 'ZodError';
  const isPayloadTooLarge = err?.type === 'entity.too.large';
  const statusCode = isValidationError ? 400 : isPayloadTooLarge ? 413 : err instanceof ApiError ? err.statusCode : 500;
  const message = isValidationError
    ? 'Invalid request data.'
    : isPayloadTooLarge
      ? 'Image must be 5 MB or smaller.'
      : statusCode === 500
        ? 'Something went wrong. Please try again.'
        : err.message;

  if (statusCode === 500) console.error(err);

  res.status(statusCode).json({
    error: {
      message,
      details: isValidationError ? err.errors : err.details || null
    }
  });
}
