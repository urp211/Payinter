/**
 * FX service — rates come from a provider ABSTRACTION (sandbox feed or manual
 * admin rates in fx_rates); cross pairs derived through USD. Never hard-code
 * live rates in business code.
 */
import { db } from '../db';
import { config } from '../config';
import { errors } from '../lib/errors';

export interface RateInfo { rate: string; provider: string; sandbox: boolean; fetchedAt: string }

async function directRate(base: string, quote: string): Promise<RateInfo | null> {
  const { rows } = await db.query(
    'SELECT rate::text, provider, sandbox, fetched_at FROM fx_rates WHERE base=$1 AND quote=$2',
    [base, quote]
  );
  if (!rows.length) return null;
  return { rate: rows[0].rate, provider: rows[0].provider, sandbox: rows[0].sandbox, fetchedAt: rows[0].fetched_at };
}

export async function getRate(base: string, quote: string): Promise<RateInfo> {
  if (base === quote) return { rate: '1.0000000000', provider: 'identity', sandbox: config.demoMode, fetchedAt: new Date().toISOString() };
  const direct = await directRate(base, quote);
  if (direct) return direct;
  // inverse
  const inv = await directRate(quote, base);
  if (inv) {
    const r = (1 / Number(inv.rate)).toFixed(10);
    return { rate: r, provider: inv.provider, sandbox: inv.sandbox, fetchedAt: inv.fetchedAt };
  }
  // cross via USD
  const a = await directRate('USD', base) ?? (base === 'USD' ? { rate: '1', provider: 'identity', sandbox: config.demoMode, fetchedAt: new Date().toISOString() } : null);
  const b = await directRate('USD', quote) ?? (quote === 'USD' ? { rate: '1', provider: 'identity', sandbox: config.demoMode, fetchedAt: new Date().toISOString() } : null);
  if (a && b) {
    const r = (Number(b.rate) / Number(a.rate)).toFixed(10);
    return { rate: r, provider: b.provider, sandbox: b.sandbox, fetchedAt: b.fetchedAt };
  }
  throw errors.validation(`No FX rate available for ${base}/${quote}`);
}

export async function convert(base: string, quote: string, amountMinor: number): Promise<{ rateInfo: RateInfo; quoteMinor: number }> {
  const rateInfo = await getRate(base, quote);
  const quoteMinor = Math.round(amountMinor * Number(rateInfo.rate));
  return { rateInfo, quoteMinor };
}

export async function listRates(base?: string) {
  if (base) {
    const { rows } = await db.query(
      `SELECT base, quote, rate::text, provider, sandbox, fetched_at FROM fx_rates WHERE base=$1 ORDER BY quote`, [base]
    );
    return rows;
  }
  const { rows } = await db.query('SELECT base, quote, rate::text, provider, sandbox, fetched_at FROM fx_rates ORDER BY base, quote');
  return rows;
}

export async function setManualRate(base: string, quote: string, rate: number): Promise<void> {
  await db.query(
    `INSERT INTO fx_rates (base, quote, rate, provider, sandbox, fetched_at)
     VALUES ($1,$2,$3,'manual',false, now())
     ON CONFLICT (base, quote) DO UPDATE SET rate=EXCLUDED.rate, provider='manual', sandbox=false, fetched_at=now()`,
    [base, quote, rate]
  );
}

export async function listCurrencies(activeOnly = true) {
  const { rows } = await db.query(
    `SELECT code, name, symbol, decimals, is_active FROM currencies ${activeOnly ? 'WHERE is_active' : ''} ORDER BY code`
  );
  return rows;
}
