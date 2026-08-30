/** Fraud rules: velocity + large amount → park transaction in review queue. */
import { db } from '../db';
import { config } from '../config';

export interface FraudDecision {
  flagged: boolean;
  rules: string[];
}

export async function evaluateTransfer(userId: string, amountMinor: number, currency: string, kind: string): Promise<FraudDecision> {
  const rules: string[] = [];
  const { rows } = await db.query<{ c: string }>(
    `SELECT count(*)::text AS c FROM transactions
     WHERE user_id=$1 AND created_at > now() - make_interval(secs => $2) AND type IN ('send','card_topup','international','qr_pay')`,
    [userId, config.fraud.velocityWindowSeconds]
  );
  if (Number(rows[0].c) >= config.fraud.velocityMaxTransactions) rules.push('velocity');
  if (amountMinor >= config.fraud.largeAmountMinor && ['USD','EUR','GBP','CAD'].includes(currency)) rules.push('large_amount');
  return { flagged: rules.length > 0, rules };
}

export async function flag(userId: string, transactionId: string, rule: string, severity: string) {
  await db.query(
    `INSERT INTO fraud_alerts (user_id, transaction_id, rule, severity) VALUES ($1,$2,$3,$4)`,
    [userId, transactionId, rule, severity]
  );
}
