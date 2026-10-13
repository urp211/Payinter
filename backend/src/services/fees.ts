/** Fee engine: rule lookup (kind + currency), percent bps + fixed, min/max clamp. */
import { db } from '../db';
import { percentBpsOf } from '../lib/money';

export interface FeeQuote {
  feeMinor: number;
  ruleName: string;
  percentBps: number;
  fixedMinor: number;
}

export async function calculateFee(kind: string, amountMinor: number, currency: string, opts?: { priority?: number }): Promise<FeeQuote> {
  const { rows } = await db.query<{
    name: string; percent_bps: string; fixed_minor: string; min_minor: string; max_minor: string | null; priority: number;
  }>(
    `SELECT name, percent_bps, fixed_minor, min_minor, max_minor, priority
     FROM fee_rules WHERE kind=$1 AND active
       AND (currency IS NULL OR currency=$2)
       ${opts?.priority !== undefined ? 'AND priority=$3' : ''}
     ORDER BY (currency IS NULL) ASC, priority DESC, id LIMIT 1`,
    opts?.priority !== undefined ? [kind, currency, opts.priority] : [kind, currency]
  );
  if (!rows.length) return { feeMinor: 0, ruleName: 'no-fee', percentBps: 0, fixedMinor: 0 };
  const r = rows[0];
  const pct = percentBpsOf(Number(r.percent_bps), amountMinor);
  let fee = pct + Number(r.fixed_minor);
  const min = Number(r.min_minor);
  if (fee < min) fee = min;
  if (r.max_minor != null && fee > Number(r.max_minor)) fee = Number(r.max_minor);
  return { feeMinor: fee, ruleName: r.name, percentBps: Number(r.percent_bps), fixedMinor: Number(r.fixed_minor) };
}

export async function listFeeRules() {
  const { rows } = await db.query('SELECT * FROM fee_rules ORDER BY kind, priority');
  return rows;
}
