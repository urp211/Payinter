import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config';
import { db } from './db';
import { errorHandler } from './middleware/errorHandler';
import { metaRouter } from './routes/meta';
import { fxRouter } from './routes/fx';
import { authRouter } from './routes/auth';
import { walletRouter } from './routes/wallet';
import { usersRouter } from './routes/users';
import { transfersRouter } from './routes/transfers';
import { transactionsRouter } from './routes/transactions';
import { paymentsRouter, topupsRouter } from './routes/payments';
import { cardsRouter } from './routes/cards';
import { internationalRouter } from './routes/international';
import { recipientsRouter } from './routes/recipients';
import { qrRouter } from './routes/qr';
import { kycRouter } from './routes/kyc';
import { notificationsRouter } from './routes/notifications';
import { supportRouter } from './routes/support';
import { privacyRouter } from './routes/privacy';
import { legalRouter } from './routes/legal';
import { adminRouter } from './routes/admin';

export function buildApp(): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({
    origin: (origin, cb) => {
      if (!origin || config.corsOrigins.includes(origin) || /https:\/\/.*\.e2b\.app$/.test(origin) || /^http:\/\/localhost:\d+$/.test(origin)) {
        return cb(null, true);
      }
      cb(null, false);
    },
    credentials: true
  }));
  app.use(express.json({ limit: '512kb' }));

  // ---- OPS (unauthenticated by design) ----
  app.get('/ops/health', async (_req: Request, res: Response) => {
    let dbState = 'down';
    try { await db.query('SELECT 1'); dbState = 'up'; } catch { /* down */ }
    res.json({
      status: 'ok', service: 'payinter-api', version: '1.0.0',
      environment: config.demoMode ? 'sandbox' : 'production', db: dbState,
      time: new Date().toISOString()
    });
  });
  app.get('/ops/ready', async (_req, res) => {
    try { await db.query('SELECT 1'); res.json({ ready: true }); }
    catch { res.status(503).json({ ready: false }); }
  });
  app.get('/ops/metrics', (_req, res) => {
    res.type('text/plain').send(
      `# HELP payinter_up API up\n# TYPE payinter_up gauge\npayinter_up 1\n` +
      `# HELP payinter_sandbox Sandbox flag\n# TYPE payinter_sandbox gauge\npayinter_sandbox ${config.demoMode ? 1 : 0}\n`
    );
  });

  // ---- v1 ----
  app.use('/v1/meta', metaRouter);
  app.use('/v1/fx', fxRouter);
  app.use('/v1/auth', authRouter);
  app.use('/v1/wallet', walletRouter);
  app.use('/v1/users', usersRouter);
  app.use('/v1/transfers', transfersRouter);
  app.use('/v1/transactions', transactionsRouter);
  app.use('/v1/payments', paymentsRouter);
  app.use('/v1/topups', topupsRouter);
  app.use('/v1/cards', cardsRouter);
  app.use('/v1/payments/international', internationalRouter);
  app.use('/v1/recipients', recipientsRouter);
  app.use('/v1/qr', qrRouter);
  app.use('/v1/kyc', kycRouter);
  app.use('/v1/notifications', notificationsRouter);
  app.use('/v1/support', supportRouter);
  app.use('/v1/privacy', privacyRouter);
  app.use('/v1/legal', legalRouter);
  app.use('/v1/admin', adminRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });
  app.use(errorHandler);
  return app;
}
