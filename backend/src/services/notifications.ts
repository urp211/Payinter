/** In-app notifications (push hooks stubbed). */
import { db } from '../db';

export async function notify(userId: string, type: string, title: string, body: string) {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO notifications (user_id, type, title, body) VALUES ($1,$2,$3,$4) RETURNING id`,
    [userId, type, title, body]
  );
  return rows[0].id;
}

export async function broadcast(type: string, title: string, body: string): Promise<number> {
  const { rows } = await db.query(
    `INSERT INTO notifications (user_id, type, title, body)
     SELECT id, $1, $2, $3 FROM users WHERE status='active' RETURNING id`,
    [type, title, body]
  );
  return rows.length;
}
