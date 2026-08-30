/**
 * Data layer. Embedded PGlite for dev/tests (zero infra), PostgreSQL in
 * production via DATABASE_URL. Same typed query interface for both.
 */
import { PGlite } from '@electric-sql/pglite';
import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import { config } from '../config';

export interface Queryable {
  query<T = any>(text: string, params?: unknown[]): Promise<{ rows: T[]; rowCount: number }>;
}

export class Db {
  private pgPool?: Pool;
  private pglite?: PGlite;
  private migrateReady = false;

  async init(): Promise<void> {
    if (config.db.embedded) {
      fs.mkdirSync(path.dirname(config.db.embeddedPath), { recursive: true });
      this.pglite = new PGlite(config.db.embeddedPath);
      await this.pglite.waitReady;
    } else {
      this.pgPool = new Pool({ connectionString: config.db.url, max: 10 });
      await this.pgPool.query('SELECT 1');
    }
  }

  get isPg() { return !!this.pgPool; }

  async query<T = any>(text: string, params: unknown[] = []): Promise<{ rows: T[]; rowCount: number }> {
    if (this.pgPool) return this.pgPool.query(text, params as any[]) as unknown as Promise<{ rows: T[]; rowCount: number }>;
    const res = await this.pglite!.query<T>(text, params as any[]);
    return { rows: res.rows, rowCount: res.affectedRows ?? res.rows.length };
  }

  /** Multi-statement script execution (migrations, seed files). */
  async exec(script: string): Promise<void> {
    if (this.pgPool) {
      await this.pgPool.query(script);
      return;
    }
    // PGlite: exec supports multiple statements in one call
    await this.pglite!.exec(script);
  }

  async transaction<T>(fn: (q: Queryable) => Promise<T>): Promise<T> {
    if (this.pgPool) {
      const client = await this.pgPool.connect();
      try {
        await client.query('BEGIN');
        const out = await fn(client as unknown as Queryable);
        await client.query('COMMIT');
        return out;
      } catch (e) {
        try { await client.query('ROLLBACK'); } catch { /* ignore */ }
        throw e;
      } finally {
        client.release();
      }
    }
    return this.pglite!.transaction(async (tx) => {
      const q: Queryable = {
        query: async <R = any>(text: string, params: unknown[] = []) => {
          const res = await tx.query<R>(text, params as any[]);
          return { rows: res.rows, rowCount: res.affectedRows ?? res.rows.length };
        }
      };
      return fn(q);
    }) as Promise<T>;
  }

  async migrate(): Promise<void> {
    await this.query(`CREATE TABLE IF NOT EXISTS _migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
    const dir = config.db.migrationsDir;
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      const { rows } = await this.query<{ name: string }>('SELECT name FROM _migrations WHERE name=$1', [file]);
      if (rows.length) continue;
      const script = fs.readFileSync(path.join(dir, file), 'utf8');
      // ACCOUNT for the BEGIN/COMMIT inside migration files: run whole script.
      await this.exec(script);
      await this.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
    }
    this.migrateReady = true;
  }

  async close(): Promise<void> {
    if (this.pgPool) await this.pgPool.end();
    if (this.pglite) await this.pglite.close();
  }
}

export const db = new Db();
