import express from 'express';
import { config } from './config.js';
import { AppError } from './lib/errors.js';
import { requireUser } from './middleware/auth.js';
import { clientRateLimit } from './middleware/clientRateLimit.js';
import { extractRouter } from './routes/extract.js';
import { stickersRouter } from './routes/stickers.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '12mb' })); // room for a base64 manual capture

  app.get('/healthz', (_req, res) => res.json({ ok: true }));

  const v1 = express.Router();
  v1.use(requireUser, clientRateLimit(config.clientRate));
  v1.use('/extract', extractRouter);
  v1.use('/stickers', stickersRouter);
  app.use('/v1', v1);

  // Express 5 forwards async errors here on its own.
  app.use((err, _req, res, _next) => {
    if (err instanceof AppError) {
      if (err.retryAfterSec) res.set('retry-after', String(err.retryAfterSec));
      return res.status(err.status).json(err.toJSON());
    }
    if (err.type === 'entity.too.large') return res.status(413).json({ error: { code: 'TOO_LARGE', message: 'Request too large.' } });
    console.error(err);
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Something broke on our side.' } });
  });

  return app;
}
