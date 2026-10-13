import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { config } from '../config';

// bcrypt cost: 12 in production, configurable via env (test suites use 4 for speed)
const PASSWORD_ROUNDS = Number(process.env.BCRYPT_ROUNDS ?? (config.isTest ? 4 : 12));
const PIN_ROUNDS = Number(process.env.BCRYPT_PIN_ROUNDS ?? Math.max(4, PASSWORD_ROUNDS - 2));

export async function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, PASSWORD_ROUNDS);
}
export async function verifyPassword(pw: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pw, hash);
}

export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin + config.pinPepper, PIN_ROUNDS);
}
export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pin + config.pinPepper, hash);
}

export function hmacSha256(secret: string, data: string): string {
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

export function otpCode(): string {
  return String(crypto.randomInt(100000, 1000000));
}
