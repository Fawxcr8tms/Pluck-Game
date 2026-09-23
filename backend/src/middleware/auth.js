import { config } from '../config.js';
import { AppError, ErrorCode } from '../lib/errors.js';
import { auth } from '../lib/firebase.js';

/** Verifies the Firebase ID token the app sends as `Authorization: Bearer <token>`. */
export async function requireUser(req, _res, next) {
  if (config.devNoAuth) {
    req.uid = 'dev-user';
    return next();
  }
  const token = req.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return next(new AppError(ErrorCode.UNAUTHENTICATED, 'Sign in first.'));
  try {
    req.uid = (await auth().verifyIdToken(token)).uid;
    next();
  } catch {
    next(new AppError(ErrorCode.UNAUTHENTICATED, 'Your session expired. Sign in again.'));
  }
}
