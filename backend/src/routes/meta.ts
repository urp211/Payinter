import { Router } from 'express';
import { config } from '../config';
import { listCurrencies } from '../services/fx';

export const metaRouter = Router();

const METHODS = [
  { method: 'card', label: 'Visa / Mastercard', speed: 'Instant', countries: null },
  { method: 'bank_transfer', label: 'Bank transfer', speed: 'Same day / 1–2 days', countries: null },
  { method: 'mobile_money', label: 'Mobile money', speed: 'Minutes', countries: ['AO', 'KE', 'NG', 'GH', 'CM'] },
  { method: 'p2p', label: 'PayInter user', speed: 'Instant', countries: null },
  { method: 'qr', label: 'QR payment', speed: 'Instant', countries: null }
];

metaRouter.get('/bootstrap', async (_req, res) => {
  const currencies = await listCurrencies(true);
  res.json({
    app: 'PayInter',
    apiVersion: 'v1',
    environment: config.demoMode ? 'sandbox' : 'production',
    sandbox: config.demoMode,
    demoBanner: config.demoMode ? 'SANDBOX — demo money only, no real payments are processed' : null,
    currencies,
    paymentMethods: METHODS,
    features: {
      international: true, cards: true, qr: true, convert: true,
      kyc: true, recipients: true, notifications: true,
      biometrics: true, sandboxSimulator: config.demoMode
    }
  });
});
