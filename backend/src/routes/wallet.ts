import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth, currentUser } from '../middleware/auth';
import { getWalletFor, convertQuote, executeConvert } from '../services/wallet';
import { parse, minorUnits, currencyCode, pinSchema } from '../lib/validate';
import { idempotency } from '../middleware/idempotency';
import { audit } from '../services/audit';
import { assertPin } from './auth';

export const walletRouter = Router();
const wrap = (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);

walletRouter.use(requireAuth);

walletRouter.get('/', wrap(async (req, res) => {
  res.json(await getWalletFor(req.auth!.userId));
}));

walletRouter.post(
  '/convert/quote',
  wrap(async (req, res) => {
    const b = parse(z.object({ from: currencyCode, to: currencyCode, amountMinor: minorUnits }), req.body);
    res.json(await convertQuote(b.from, b.to, b.amountMinor));
  })
);

walletRouter.post(
  '/convert',
  idempotency,
  wrap(async (req, res) => {
    const b = parse(z.object({ from: currencyCode, to: currencyCode, amountMinor: minorUnits, pin: pinSchema.optional() }), req.body);
    const user = await currentUser(req);
    if (user.pin_hash) await assertPin(user, b.pin);
    const out = await executeConvert(user.id, b.from, b.to, b.amountMinor);
    await audit({ actorType: 'user', actorId: user.id, action: 'wallet.convert', entity: 'transaction', entityId: out.transaction.id, metadata: { from: b.from, to: b.to, amountMinor: b.amountMinor } });
    res.status(201).json(out);
  })
);
