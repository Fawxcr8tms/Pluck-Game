import { AppError, ErrorCode } from '../lib/errors.js';
import { KeyedTokenBucket } from '../lib/rateLimiter.js';

/** Per-user inbound limit, so one enthusiastic user can't burn the shared upstream budget. */
export function clientRateLimit({ perMinute }) {
  const buckets = new KeyedTokenBucket({ perSecond: perMinute / 60, burst: Math.max(5, Math.round(perMinute / 3)) });
  return (req, res, next) => {
    const wait = buckets.tryTake(req.uid ?? req.ip);
    if (wait === 0) return next();
    const retryAfterSec = Math.ceil(wait / 1000);
    res.set('retry-after', String(retryAfterSec));
    next(new AppError(ErrorCode.RATE_LIMITED, 'Slow down a little.', { retryAfterSec }));
  };
}
