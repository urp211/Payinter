import { randomUUID, createHash, randomInt } from 'crypto';

export const uuid = () => randomUUID();

const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function reference(prefix: string): string {
  const d = new Date();
  const ymd = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
  let rand = '';
  for (let i = 0; i < 6; i++) rand += REF_ALPHABET[randomInt(0, REF_ALPHABET.length)];
  return `${prefix}-${ymd}-${rand}`;
}

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
export const randomToken = (bytes = 40) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let out = '';
  for (let i = 0; i < bytes; i++) out += chars[randomInt(0, chars.length)];
  return out;
};

export function paytag(firstName?: string | null): string {
  const base = (firstName || 'user').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'user';
  return `${base}-${randomInt(1000, 9999)}`;
}
