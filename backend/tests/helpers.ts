import request from 'supertest';
import type { Express } from 'express';
import { db } from '../src/db';
import { seedDemoDataIfEmpty } from '../src/db/seed';
import { buildApp } from '../src/app';

let app: Express | null = null;

export async function initApp(): Promise<Express> {
  if (app) return app;
  await db.init();
  await db.migrate();
  await seedDemoDataIfEmpty(db);
  app = buildApp();
  return app;
}

export const DEMO = { email: 'demo@payinter.app', password: 'TestUser123!', pin: '2468' };
export const FRIEND = { email: 'friend@payinter.app', password: 'TestUser123!', pin: '1357' };
export const ADMIN = { email: 'admin@payinter.app', password: 'TestAdmin123!' };

export async function login(a: Express, email = DEMO.email, password = DEMO.password): Promise<string> {
  const res = await request(a).post('/v1/auth/login').send({ email, password });
  if (res.status !== 200) throw new Error(`login failed: ${JSON.stringify(res.body)}`);
  return res.body.tokens.accessToken as string;
}

export async function adminLogin(a: Express, email = ADMIN.email): Promise<string> {
  const res = await request(a).post('/v1/admin/auth/login').send({ email, password: ADMIN.password });
  if (res.status !== 200) throw new Error(`admin login failed: ${JSON.stringify(res.body)}`);
  return res.body.tokens.accessToken as string;
}

export function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}
