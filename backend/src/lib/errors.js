/**
 * Every failure the mobile app needs to react to has a stable code.
 * `fallback` tells the client what to offer the user next.
 */
export const ErrorCode = {
  INVALID_URL: 'INVALID_URL',
  BLOCKED_URL: 'BLOCKED_URL',
  AUTH_REQUIRED: 'AUTH_REQUIRED', // login wall: the app offers manual capture
  RATE_LIMITED: 'RATE_LIMITED',
  NOT_FOUND: 'NOT_FOUND',
  NO_STICKERS: 'NO_STICKERS',
  UPSTREAM: 'UPSTREAM',
  UNSUPPORTED_MEDIA: 'UNSUPPORTED_MEDIA',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
};

const STATUS = {
  INVALID_URL: 400,
  BLOCKED_URL: 400,
  AUTH_REQUIRED: 422,
  RATE_LIMITED: 429,
  NOT_FOUND: 404,
  NO_STICKERS: 404,
  UPSTREAM: 502,
  UNSUPPORTED_MEDIA: 415,
  UNAUTHENTICATED: 401,
};

export class AppError extends Error {
  constructor(code, message, { retryAfterSec, fallback, cause } = {}) {
    super(message, { cause });
    this.code = code;
    this.status = STATUS[code] ?? 500;
    this.retryAfterSec = retryAfterSec;
    this.fallback = fallback;
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.retryAfterSec != null && { retryAfterSec: this.retryAfterSec }),
        ...(this.fallback && { fallback: this.fallback }),
      },
    };
  }
}
