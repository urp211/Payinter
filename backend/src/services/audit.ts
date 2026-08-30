/** Audit + security event logging helper. */
import { db } from '../db';

export async function audit(entry: {
  actorType: 'user' | 'admin' | 'system';
  actorId?: string | null;
  actorLabel?: string | null;
  action: string;
  entity: string;
  entityId?: string | number | null;
  ip?: string;
  metadata?: Record<string, unknown>;
}) {
  await db.query(
    `INSERT INTO audit_logs (actor_type, actor_id, actor_label, action, entity, entity_id, ip, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [entry.actorType, entry.actorId ?? null, entry.actorLabel ?? null, entry.action, entry.entity,
     entry.entityId != null ? String(entry.entityId) : null, entry.ip ?? null, JSON.stringify(entry.metadata ?? {})]
  );
}

export async function securityEvent(entry: {
  userId?: string | null;
  userEmail?: string | null;
  type: string;
  ip?: string;
  metadata?: Record<string, unknown>;
}) {
  await db.query(
    `INSERT INTO security_events (user_id, user_email, type, ip, metadata) VALUES ($1,$2,$3,$4,$5)`,
    [entry.userId ?? null, entry.userEmail ?? null, entry.type, entry.ip ?? null, JSON.stringify(entry.metadata ?? {})]
  );
}
